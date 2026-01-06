package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-redis/redis/v8"
	_ "github.com/lib/pq"
)

func TestHealthHandler(t *testing.T) {
	// 1. Setup minimal App structure
	// We use "invalid" connections, so Ping() should fail, but not panic.
	db, _ := sql.Open("postgres", "postgres://user:pass@localhost:5432/db?sslmode=disable")
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})

	app := &App{
		DB:    db,
		Redis: rdb,
		Ctx:   context.Background(),
	}

	// 2. Create the Request and ResponseRecorder
	req, err := http.NewRequest("GET", "/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(app.healthHandler)

	// 3. Serve the request
	handler.ServeHTTP(rr, req)

	// 4. Check status code
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusOK)
	}

	// 5. Check body (Should be JSON)
	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Errorf("handler returned invalid JSON: %v", err)
	}

	// 6. Check logic (Since we are not connected, we expect "degraded" or at least "status" field)
	if _, ok := response["status"]; !ok {
		t.Errorf("handler response missing 'status' field")
	}

	val, ok := response["status"].(string)
	if !ok || (val != "healthy" && val != "degraded") {
		t.Errorf("handler status unexpected: got %v", val)
	}
}
