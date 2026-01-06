# Maria Guestbook — Application Repository

**Student:** Maria Vulcu
**Course:** CI/CD
**Date:** January 2026

---

## 🌐 Live Application

**URL:** https://maria-guestbook.cicd.cachefly.site

---

## 📦 About This Repository

This repository contains the **application source code** for the Maria Guestbook project:

- **Backend:** Go 1.24 API server
- **Frontend:** Nginx serving static HTML/JS/CSS

For infrastructure, Helm charts, and ArgoCD configuration, see:
👉 **[maria-guestbook-infra](https://github.com/mvulcu/maria-guestbook-infra)**

---

## 📁 Project Structure

```
├── backend/
│   ├── main.go           # Go API server
│   ├── main_test.go      # Unit tests
│   ├── go.mod / go.sum
│   └── Dockerfile
├── frontend/
│   ├── index.html        # Main page
│   ├── script.js         # Client-side logic
│   ├── styles.css        # Cyberpunk styling
│   ├── nginx.conf
│   └── Dockerfile
└── .github/workflows/
    └── ci.yaml           # CI/CD pipeline
```

---

## 🔄 CI/CD Pipeline

Located in `.github/workflows/ci.yaml`, the pipeline runs on every push to `main`:

| Job | Tool | Purpose |
|-----|------|---------|
| 1. **Lint** | golangci-lint | Enforce code style, catch bugs |
| 2. **Test** | go test | Run unit tests |
| 3. **Build & Scan** | Docker + Trivy | Build images, scan for vulnerabilities |
| 4. **Update Infra** | git push | Update image tags in infra repository |

### Pipeline Flow

```
Push to main
     ↓
┌─────────────────────────────────────────────────┐
│  1. Lint (golangci-lint)                        │
│  2. Test (go test -v ./...)                     │
│  3. Build Docker images → Push to GHCR          │
│  4. Trivy scan (fail on CRITICAL/HIGH)          │
│  5. Update image tag in maria-guestbook-infra   │
└─────────────────────────────────────────────────┘
     ↓
ArgoCD detects change in infra repo
     ↓
Automatic deployment to K3s cluster
```

### Security Scanning

```yaml
- name: Scan with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    exit-code: '1'
    severity: 'CRITICAL,HIGH'
```

**Policy:** Build fails immediately on CRITICAL or HIGH vulnerabilities.

---

## 🐳 Docker Images

Images are published to GitHub Container Registry (GHCR):

| Image | URL |
|-------|-----|
| Backend | `ghcr.io/mvulcu/maria-guestbook-backend` |
| Frontend | `ghcr.io/mvulcu/maria-guestbook-frontend` |

Each image is tagged with the git short SHA for immutability and traceability.

---

## 🧪 Local Development

### Backend

```bash
cd backend
go mod download
go run main.go
```

Requires environment variables:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, `DB_PASSWORD`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

### Frontend

```bash
cd frontend
# Serve with any HTTP server
python -m http.server 8080
```

### Docker Build

```bash
# Backend
docker build -t maria-guestbook-backend ./backend

# Frontend
docker build -t maria-guestbook-frontend ./frontend
```

---

## 🧪 Testing

```bash
cd backend
go test -v ./...
```

**Coverage:**
- Health endpoint validation
- Database/Redis connectivity checks

---

## 🔗 Related Repository

| Repository | Purpose |
|------------|---------|
| **[maria-guestbook-infra](https://github.com/mvulcu/maria-guestbook-infra)** | Helm charts, ArgoCD configs, Kubernetes manifests |

---

## 👥 Collaborators

- `jonasbjork` (Course Instructor)

---

## 📄 License

MIT
