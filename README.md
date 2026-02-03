<p align="center">
  <a href="https://maria-guestbook.cicd.cachefly.site">
    <img src="https://img.shields.io/badge/🌐 Live Demo-maria--guestbook-1abc9c?style=for-the-badge" alt="Live Demo">
  </a>
  <a href="https://github.com/mvulcu/maria-guestbook-app">
    <img src="https://img.shields.io/badge/📦 App Repo-You Are Here-181717?style=for-the-badge&logo=github" alt="App Repo">
  </a>
  <a href="https://github.com/mvulcu/maria-guestbook-infra">
    <img src="https://img.shields.io/badge/🏗️ Infra Repo-GitHub-181717?style=for-the-badge&logo=github" alt="Infra Repo">
  </a>
</p>

---

# Maria Guestbook — Application Repository

**Student:** Maria Vulcu  
**Course:** CI/CD  
**Date:** January 2026

---

## 📦 About This Repository

This repository contains the **application source code** for the Maria Guestbook project:

- **Backend:** Go 1.24 API server with PostgreSQL + Redis
- **Frontend:** Static HTML/JS/CSS served by Nginx
- **CI/CD:** GitHub Actions pipeline with security scanning

### 🏗️ Infrastructure Repository

For Helm charts, ArgoCD configuration, Kubernetes manifests, and complete architecture documentation:

👉 **[maria-guestbook-infra](https://github.com/mvulcu/maria-guestbook-infra)** — *GitOps infrastructure as code*

---

## 🌐 Live Application

**URL:** https://maria-guestbook.cicd.cachefly.site

---

## 🎯 Two-Repository Pattern

This project follows the **GitOps two-repository pattern** for clean separation of concerns:

| Repository | Purpose | Trigger |
|------------|---------|---------|
| **[maria-guestbook-app](https://github.com/mvulcu/maria-guestbook-app)** (this repo) | Application source code | Code changes → CI pipeline |
| **[maria-guestbook-infra](https://github.com/mvulcu/maria-guestbook-infra)** | Infrastructure as code | Infra changes → ArgoCD sync |

**Benefits:**
- Independent versioning and release cycles
- Clear ownership boundaries
- Application developers don't need Kubernetes expertise
- Infrastructure changes don't trigger application builds

---

## 📁 Project Structure

```
├── backend/
│   ├── main.go           # Go API server
│   ├── main_test.go      # Unit tests
│   ├── go.mod / go.sum   # Go dependencies
│   └── Dockerfile        # Multi-stage build
├── frontend/
│   ├── index.html        # Main page
│   ├── script.js         # Client-side logic
│   ├── styles.css        # Cyberpunk styling
│   ├── nginx.conf        # Nginx configuration
│   └── Dockerfile        # Nginx Alpine base
└── .github/workflows/
    └── ci.yaml           # CI/CD pipeline
```

---

## 🔄 CI/CD Pipeline

Located in `.github/workflows/ci.yaml`, the pipeline runs on every push to `main`:

| Stage | Tool | Purpose | Fail Condition |
|-------|------|---------|----------------|
| 1. **Lint** | golangci-lint | Enforce code style, catch bugs | Linting errors |
| 2. **Test** | go test | Run unit tests | Test failures |
| 3. **Build** | Docker | Build backend + frontend images | Build errors |
| 4. **Scan** | Trivy | Vulnerability scanning | CRITICAL/HIGH CVEs |
| 5. **Push** | GHCR | Publish images to registry | Push failures |
| 6. **Update** | git push | Update tags in infra repo | Push failures |

### Pipeline Flow

```
Developer pushes code to main
         ↓
┌─────────────────────────────────────────────────┐
│          GitHub Actions CI Pipeline             │
│                                                 │
│  1. Lint (golangci-lint)                        │
│  2. Test (go test -v ./...)                     │
│  3. Build Docker images                         │
│  4. Trivy scan (fail on CRITICAL/HIGH)          │
│  5. Push to GHCR                                │
│  6. Update image tag in maria-guestbook-infra   │
└─────────────────────────────────────────────────┘
         ↓
ArgoCD detects change in infra repo
         ↓
Argo Rollouts performs canary deployment
         ↓
Application deployed to K3s cluster
```

### Security Scanning with Trivy

```yaml
- name: Scan with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/${{ github.repository }}/backend:${{ github.sha }}
    exit-code: '1'
    severity: 'CRITICAL,HIGH'
    format: 'sarif'
    output: 'trivy-results.sarif'
```

**Security Policy:** 
- Build **fails immediately** on CRITICAL or HIGH vulnerabilities
- No vulnerable images reach GHCR or production
- Scan results uploaded to GitHub Security tab

---

## 🐳 Docker Images

Images are published to GitHub Container Registry (GHCR):

| Component | Image URL | Base Image |
|-----------|-----------|------------|
| **Backend** | `ghcr.io/mvulcu/maria-guestbook-backend` | golang:1.24-alpine → alpine:latest |
| **Frontend** | `ghcr.io/mvulcu/maria-guestbook-frontend` | nginx:alpine |

### Image Tagging Strategy

Each image is tagged with:
- **Git short SHA** (e.g., `abc1234`) — for immutability and traceability
- **`latest`** — always points to the most recent successful build

**Example:**
```bash
ghcr.io/mvulcu/maria-guestbook-backend:a3f8c21
ghcr.io/mvulcu/maria-guestbook-backend:latest
```

### Multi-Stage Build (Backend)

```dockerfile
# Stage 1: Build
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
RUN go build -o server .

# Stage 2: Runtime
FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/server /server
CMD ["/server"]
```

**Benefits:**
- Small final image size (~15MB vs ~400MB)
- No build tools in production image
- Reduced attack surface

---

## 🧪 Local Development

### Backend

```bash
cd backend

# Install dependencies
go mod download

# Run tests
go test -v ./...

# Run locally (requires PostgreSQL + Redis)
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=guestbook
export DB_NAME=guestbook
export DB_PASSWORD=yourpassword
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=yourpassword

go run main.go
```

**API Endpoints:**
- `GET /health` — Health check
- `GET /messages` — List all messages
- `POST /messages` — Create new message
- `GET /metrics` — Prometheus metrics

### Frontend

```bash
cd frontend

# Serve with any HTTP server
python -m http.server 8080
# or
npx http-server -p 8080
```

Open http://localhost:8080

### Docker Compose (Full Stack)

```bash
# Run complete stack locally
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

*(Note: docker-compose.yaml not included in this repo, maintained separately)*

---

## 🧪 Testing

### Unit Tests

```bash
cd backend
go test -v ./...
```

**Current Coverage:**
- ✅ Health endpoint validation
- ✅ Database connection error handling
- ✅ Redis connection error handling
- ✅ Message creation validation
- ✅ Message retrieval logic

### Manual Testing

```bash
# Backend health check
curl http://localhost:8080/health

# Create message
curl -X POST http://localhost:8080/messages \
  -H "Content-Type: application/json" \
  -d '{"author": "Test", "content": "Hello World"}'

# Get messages
curl http://localhost:8080/messages
```

---

## 🔗 Related Repositories

| Repository | Purpose | Link |
|------------|---------|------|
| **maria-guestbook-infra** | Helm charts, ArgoCD configs, Kubernetes manifests, complete architecture docs | [View Repo](https://github.com/mvulcu/maria-guestbook-infra) |

For full project documentation including:
- Architecture diagrams
- GitOps workflow
- Monitoring & observability setup
- Security implementation
- Deployment instructions

See the infrastructure repository README.

---

## 🛠️ Technology Stack

### Backend
- **Language:** Go 1.24
- **Framework:** Standard library (net/http)
- **Database:** PostgreSQL 15
- **Cache:** Redis 7
- **Metrics:** Prometheus client

### Frontend
- **HTML/CSS/JavaScript** (Vanilla)
- **Web Server:** Nginx Alpine
- **Styling:** Cyberpunk theme

### CI/CD
- **CI:** GitHub Actions
- **Container Registry:** GHCR (GitHub Container Registry)
- **Security Scanning:** Trivy
- **Code Quality:** golangci-lint

---

## 📚 Key Features

### Backend Features
- RESTful API for message management
- PostgreSQL for persistent storage
- Redis for caching layer
- Prometheus metrics endpoint
- Health check endpoint
- Graceful shutdown handling
- Connection pooling

### Frontend Features
- Responsive design
- Real-time message submission
- Message list with timestamps
- Cyberpunk aesthetic
- Client-side validation

### CI/CD Features
- Automated linting and testing
- Security vulnerability scanning
- Multi-stage Docker builds
- Automatic image versioning
- GitOps integration

---

## 🎓 Development Notes

This application was built as part of a CI/CD course project, with a focus on:

- **Clean Code:** Following Go best practices and idiomatic patterns
- **Security First:** Vulnerability scanning at build time, not deployment time
- **Observability:** Built-in metrics and health checks from day one
- **GitOps-Ready:** Image tags managed declaratively, not imperatively
- **Production Thinking:** Multi-stage builds, graceful shutdowns, error handling

> *"Meeting requirements is the baseline — the real learning happens when you ask 'what would production look like?'"*

---

## 👥 Collaborators

- **jonasbjork** (Course Instructor)

---

## 📄 License

MIT

---

<p align="center">
  <em>Built with ❤️ by Maria Vulcu</em><br/>
  <a href="https://grepme.dev">grepme.dev</a> · 
  <a href="mailto:ping@grepme.dev">ping@grepme.dev</a> · 
  <a href="https://linkedin.com/in/mariavulcu">LinkedIn</a>
</p>
