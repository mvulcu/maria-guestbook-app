package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Entry struct updated to support Stamps
type Entry struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Message   string    `json:"message"`
	Level     string    `json:"level"`
	StampsRaw string    `json:"-"`      // Internal use for DB scanning
	Stamps    []string  `json:"stamps"` // Array for JSON output
	CreatedAt time.Time `json:"created_at"`
}

type StampRequest struct {
	Stamp string `json:"stamp"`
}

type App struct {
	DB      *sql.DB
	Redis   *redis.Client
	Ctx     context.Context
	Metrics *Metrics
}

// Prometheus metrics (Standard setup)
type Metrics struct {
	requestsTotal    *prometheus.CounterVec
	cacheHits        prometheus.Counter
	cacheMisses      prometheus.Counter
	dbEntriesTotal   prometheus.Gauge
	httpDuration     *prometheus.HistogramVec
	dbUp             prometheus.Gauge
	redisUp          prometheus.Gauge
}

func NewMetrics() *Metrics {
	m := &Metrics{
		requestsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "guestbook_requests_total",
				Help: "Total number of HTTP requests",
			},
			[]string{"method", "endpoint", "status"},
		),
		cacheHits: prometheus.NewCounter(
			prometheus.CounterOpts{
				Name: "guestbook_cache_hits_total",
				Help: "Total number of cache hits",
			},
		),
		cacheMisses: prometheus.NewCounter(
			prometheus.CounterOpts{
				Name: "guestbook_cache_misses_total",
				Help: "Total number of cache misses",
			},
		),
		dbEntriesTotal: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Name: "guestbook_db_entries_total",
				Help: "Total number of entries in database",
			},
		),
		httpDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "guestbook_http_duration_seconds",
				Help:    "Duration of HTTP requests in seconds",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"method", "endpoint"},
		),
		dbUp: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Name: "guestbook_db_up",
				Help: "Database availability (1 = up, 0 = down)",
			},
		),
		redisUp: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Name: "guestbook_redis_up",
				Help: "Redis availability (1 = up, 0 = down)",
			},
		),
	}

	prometheus.MustRegister(
		m.requestsTotal,
		m.cacheHits,
		m.cacheMisses,
		m.dbEntriesTotal,
		m.httpDuration,
		m.dbUp,
		m.redisUp,
	)

	return m
}

func main() {
	app := &App{
		Ctx:     context.Background(),
		Metrics: NewMetrics(),
	}

	// Database Connection
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "guestbook")
	dbPass := getEnv("DB_PASSWORD", "password")
	dbName := getEnv("DB_NAME", "guestbook")

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPass, dbName)

	var err error
	app.DB, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal("DB Connection failed:", err)
	}
	defer app.DB.Close()

	// Wait for DB
	for i := 0; i < 30; i++ {
		err = app.DB.Ping()
		if err == nil {
			break
		}
		log.Println("Waiting for database...")
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatal("Database unreachable:", err)
	}

	log.Println("✓ Connected to PostgreSQL")

	// Initialize Schema (v4.2 with Stamps)
	app.initDB()

	// Redis Connection
	redisHost := getEnv("REDIS_HOST", "localhost")
	redisPort := getEnv("REDIS_PORT", "6379")
	redisPass := getEnv("REDIS_PASSWORD", "")

	app.Redis = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", redisHost, redisPort),
		Password: redisPass,
		DB:       0,
	})

	_, err = app.Redis.Ping(app.Ctx).Result()
	if err != nil {
		log.Println("⚠ Redis unreachable, running without cache:", err)
	} else {
		log.Println("✓ Connected to Redis")
	}

	go app.updateMetricsPeriodically()

	// Router Setup
	r := mux.NewRouter()
	r.Use(corsMiddleware)
	r.Use(app.metricsMiddleware)

	// Routes
	r.HandleFunc("/health", app.healthHandler).Methods("GET")
	r.HandleFunc("/metrics", promhttp.Handler().ServeHTTP).Methods("GET")
	r.HandleFunc("/api/entries", app.getEntriesHandler).Methods("GET")
	r.HandleFunc("/api/entries", app.createEntryHandler).Methods("POST")
	r.HandleFunc("/api/entries/{id}", app.updateEntryHandler).Methods("PUT")
	r.HandleFunc("/api/entries/{id}", app.deleteEntryHandler).Methods("DELETE")
	// NEW: Stamp Endpoint
	r.HandleFunc("/api/entries/{id}/stamp", app.addStampHandler).Methods("POST")
	r.HandleFunc("/api/stats", app.statsHandler).Methods("GET")

	port := getEnv("PORT", "8080")
	log.Printf("🚀 Server v4.2 (Stamps) starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func (app *App) initDB() {
	// 1. Create table
	query := `
	CREATE TABLE IF NOT EXISTS entries (
		id SERIAL PRIMARY KEY,
		name VARCHAR(100) NOT NULL,
		message TEXT NOT NULL,
		level VARCHAR(20) DEFAULT 'INFO',
		stamps TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`

	_, err := app.DB.Exec(query)
	if err != nil {
		log.Fatal("Table creation failed:", err)
	}

	// 2. Migrations for existing DBs
	// Add level column
	app.DB.Exec(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS level VARCHAR(20) DEFAULT 'INFO';`)
	// Add stamps column
	app.DB.Exec(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS stamps TEXT DEFAULT '';`)

	log.Println("✓ Database Schema (v4.2) initialized")
}

func (app *App) updateMetricsPeriodically() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		var count int
		err := app.DB.QueryRow("SELECT COUNT(*) FROM entries").Scan(&count)
		if err == nil {
			app.Metrics.dbEntriesTotal.Set(float64(count))
		}

		if err := app.DB.Ping(); err != nil {
			app.Metrics.dbUp.Set(0)
		} else {
			app.Metrics.dbUp.Set(1)
		}

		if _, err := app.Redis.Ping(app.Ctx).Result(); err != nil {
			app.Metrics.redisUp.Set(0)
		} else {
			app.Metrics.redisUp.Set(1)
		}
	}
}

func (app *App) metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)
		duration := time.Since(start).Seconds()
		app.Metrics.requestsTotal.WithLabelValues(r.Method, r.URL.Path, strconv.Itoa(rw.statusCode)).Inc()
		app.Metrics.httpDuration.WithLabelValues(r.Method, r.URL.Path).Observe(duration)
	})
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (app *App) healthHandler(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{"status": "healthy", "time": time.Now()}
	if err := app.DB.Ping(); err != nil {
		health["database"] = "unhealthy"
		health["status"] = "degraded"
	} else {
		health["database"] = "healthy"
	}
	if _, err := app.Redis.Ping(app.Ctx).Result(); err != nil {
		health["redis"] = "unhealthy"
	} else {
		health["redis"] = "healthy"
	}
	json.NewEncoder(w).Encode(health)
}

func (app *App) getEntriesHandler(w http.ResponseWriter, r *http.Request) {
	cacheKey := "entries:all"

	if app.Redis != nil {
		cached, err := app.Redis.Get(app.Ctx, cacheKey).Result()
		if err == nil && cached != "" {
			w.Header().Set("X-Cache", "HIT")
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(cached))
			return
		}
	}

	// Updated Query to fetch stamps
	rows, err := app.DB.Query(`
		SELECT id, name, message, level, stamps, created_at
		FROM entries
		ORDER BY created_at DESC
		LIMIT 100
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	entries := []Entry{}
	for rows.Next() {
		var e Entry
		// Scan stamps into raw string
		if err := rows.Scan(&e.ID, &e.Name, &e.Message, &e.Level, &e.StampsRaw, &e.CreatedAt); err != nil {
			continue
		}
		// Convert "STAMP1,STAMP2" string to array ["STAMP1", "STAMP2"]
		if e.StampsRaw != "" {
			e.Stamps = strings.Split(e.StampsRaw, ",")
		} else {
			e.Stamps = []string{}
		}
		entries = append(entries, e)
	}

	if app.Redis != nil {
		jsonData, err := json.Marshal(entries)
		if err == nil {
			app.Redis.Set(app.Ctx, cacheKey, jsonData, 5*time.Minute)
		}
	}

	w.Header().Set("X-Cache", "MISS")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

func (app *App) createEntryHandler(w http.ResponseWriter, r *http.Request) {
	var entry Entry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		http.Error(w, "Invalid Payload", http.StatusBadRequest)
		return
	}

	if entry.Name == "" || entry.Message == "" {
		http.Error(w, "Name and Message required", http.StatusBadRequest)
		return
	}

	// Insert without stamps (default empty)
	err := app.DB.QueryRow(`
		INSERT INTO entries (name, message, level, stamps)
		VALUES ($1, $2, $3, '')
		RETURNING id, created_at
	`, entry.Name, entry.Message, entry.Level).Scan(&entry.ID, &entry.CreatedAt)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if app.Redis != nil {
		app.Redis.Del(app.Ctx, "entries:all")
		app.Redis.Incr(app.Ctx, "stats:total_entries")
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(entry)
}

// NEW: Handler to add a stamp
func (app *App) addStampHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var req StampRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid Body", http.StatusBadRequest)
		return
	}

	if req.Stamp == "" {
		http.Error(w, "Stamp required", http.StatusBadRequest)
		return
	}

	// Logic: Append new stamp with comma separator
	// If empty, set it. If not empty, append ",STAMP"
	query := `
		UPDATE entries
		SET stamps = CASE
			WHEN stamps = '' OR stamps IS NULL THEN $1
			ELSE stamps || ',' || $1
		END
		WHERE id = $2`

	result, err := app.DB.Exec(query, req.Stamp, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		http.Error(w, "Entry not found", http.StatusNotFound)
		return
	}

	if app.Redis != nil {
		app.Redis.Del(app.Ctx, "entries:all")
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "stamped"})
}

func (app *App) updateEntryHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var entry Entry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		http.Error(w, "Invalid data", http.StatusBadRequest)
		return
	}

	if entry.Name == "" || entry.Message == "" {
		http.Error(w, "Name and Message required", http.StatusBadRequest)
		return
	}

	result, err := app.DB.Exec(`
		UPDATE entries
		SET name = $1, message = $2
		WHERE id = $3
	`, entry.Name, entry.Message, id)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	if app.Redis != nil {
		app.Redis.Del(app.Ctx, "entries:all")
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Updated"})
}

func (app *App) deleteEntryHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	result, err := app.DB.Exec("DELETE FROM entries WHERE id = $1", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	if app.Redis != nil {
		app.Redis.Del(app.Ctx, "entries:all")
		app.Redis.Decr(app.Ctx, "stats:total_entries")
	}

	w.WriteHeader(http.StatusNoContent)
}

func (app *App) statsHandler(w http.ResponseWriter, r *http.Request) {
	stats := make(map[string]interface{})
	var count int
	app.DB.QueryRow("SELECT COUNT(*) FROM entries").Scan(&count)
	stats["total_entries_db"] = count

	if app.Redis != nil {
		cacheCount, _ := app.Redis.Get(app.Ctx, "stats:total_entries").Result()
		stats["total_entries_created"] = cacheCount
		info, _ := app.Redis.Info(app.Ctx, "stats").Result()
		if info != "" {
			stats["cache_available"] = true
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Expose-Headers", "X-Cache")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
