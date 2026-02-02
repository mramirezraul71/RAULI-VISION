package main

import (
	"encoding/json"
	"net/http"
	"time"
)

func handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	response := map[string]interface{}{
		"status": "ok",
		"timestamp": time.Now(),
		"service": "rauli-vision-api",
		"path": r.URL.Path,
	}
	
	json.NewEncoder(w).Encode(response)
}
