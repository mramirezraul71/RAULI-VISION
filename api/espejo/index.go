// Package main for Vercel serverless deployment
package main

import (
	"log"
	"net/http"
	"os"
)

func init() {
	// Initialize logging
	log.SetOutput(os.Stdout)
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}

// Main handler for Vercel
func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	
	// Route to appropriate handler
	switch r.URL.Path {
	case "/", "/health", "/api/health":
		HealthHandler(w, r)
	default:
		w.WriteHeader(http.StatusNotFound)
		response := map[string]interface{}{
			"error": "Endpoint not found",
			"path":  r.URL.Path,
			"service": "espejo-rauli-vision",
		}
		json.NewEncoder(w).Encode(response)
	}
}
