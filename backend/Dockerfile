# Stage 1: build
FROM golang:1.24-alpine AS builder

WORKDIR /workspace

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o guestbook-api .

# Stage 2
FROM alpine:latest

WORKDIR /opt/app

# Install curl for healthcheck
RUN apk add --no-cache curl

COPY --from=builder /workspace/guestbook-api /opt/app/guestbook-api

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["/opt/app/guestbook-api"]
