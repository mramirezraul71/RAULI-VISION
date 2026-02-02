package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/rauli-vision/cliente-local/internal/api"
	"github.com/rauli-vision/cliente-local/internal/cache"
	"github.com/rauli-vision/cliente-local/internal/middleware"
)

var version = "1.0.0"

func main() {
	espejoURL := os.Getenv("ESPEJO_URL")
	if espejoURL == "" {
		espejoURL = "http://localhost:8080"
	}
	clientID := os.Getenv("CLIENT_ID")
	clientSecret := os.Getenv("CLIENT_SECRET")
	if clientID == "" {
		clientID = "rauli-local"
	}
	if clientSecret == "" {
		clientSecret = "rauli-local-secret"
	}
	if v := os.Getenv("VERSION"); v != "" {
		version = v
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	dbPath := os.Getenv("CACHE_DB")
	if dbPath == "" {
		dbPath = "rauli-cache.db"
	}

	c, err := cache.New(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer c.Close()

	staticRoot := http.FS(os.DirFS("static"))
	proxy := api.NewProxy(espejoURL, clientID, clientSecret, version, c, staticRoot)
	rl := middleware.NewRateLimiter(180, time.Minute)
	handler := middleware.Logging(middleware.RequestID(rl.Middleware(proxy)))

	addr := ":" + port
	log.Printf("Proxy v%s escuchando en %s", version, addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
