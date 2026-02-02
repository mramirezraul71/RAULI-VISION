package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/access"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/api"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/auth"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/chat"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/middleware"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/search"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/video"
)

var version = "1.0.0"

func main() {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "rauli-vision-espejo-default-secret-change-in-production"
	}
	if v := os.Getenv("VERSION"); v != "" {
		version = v
	}
	adminToken := os.Getenv("ADMIN_TOKEN")
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	accessStore := os.Getenv("ACCESS_STORE")
	if accessStore == "" {
		accessStore = "data/access-store.json"
	}

	authSvc := auth.New(jwtSecret)
	searchSvc := search.New()
	videoSvc := video.New()
	chatSvc := chat.New()
	accessSvc, err := access.New(accessStore)
	if err != nil {
		log.Fatalf("No se pudo iniciar el almacén de accesos: %v", err)
	}
	// Pocos usuarios, calidad: límite bajo por IP para evitar saturación y dar respuesta estable.
	rl := middleware.NewRateLimiter(120, time.Minute) // 120 req/min por IP

	mux := http.NewServeMux()
	api.Register(mux, version, authSvc, searchSvc, videoSvc, chatSvc, accessSvc, adminToken, rl)

	addr := ":" + port
	log.Printf("Espejo v%s escuchando en %s", version, addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
