# Build (CGO for go-sqlite3)
FROM golang:1.22-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o /proxy ./cmd/proxy

# Run (alpine with sqlite libs for CGO binary - or use debian slim)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libc6 wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /proxy .
EXPOSE 3000
ENV PORT=3000
ENV ESPEJO_URL=http://espejo:8080
CMD ["./proxy"]
