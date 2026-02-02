// Package main provides the health check API for proxy service
package main

import (
	"encoding/json"
	"net/http"
	"time"
)

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Service   string    `json:"service"`
	Version   string    `json:"version"`
}

// HealthHandler handles health check requests
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	response := HealthResponse{
		Status:    "ok",
		Timestamp: time.Now(),
		Service:   "proxy-rauli-vision",
		Version:   "1.0.0",
	}
	
	json.NewEncoder(w).Encode(response)
}

// Handler for Vercel serverless
func Handler(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/health", "/api/health":
		HealthHandler(w, r)
	default:
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Endpoint not found"})
	}
}
