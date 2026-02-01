package middleware

import (
	"encoding/json"
	"net/http"
	"time"
)

type logEntry struct {
	Time       string  `json:"time"`
	Level      string  `json:"level"`
	Method     string  `json:"method"`
	Path       string  `json:"path"`
	Status     int     `json:"status"`
	DurationMs float64 `json:"duration_ms"`
	RequestID  string  `json:"request_id,omitempty"`
}

type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (r *responseRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// Logging wraps next with JSON request logging (method, path, status, duration_ms, request_id).
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rid := r.Header.Get(headerRequestID)
		if rid == "" {
			rid = r.Header.Get("X-Correlation-ID")
		}
		rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		dur := time.Since(start).Milliseconds()
		level := "info"
		if rec.status >= 500 {
			level = "error"
		} else if rec.status >= 400 {
			level = "warn"
		}
		entry := logEntry{
			Time:       time.Now().UTC().Format(time.RFC3339),
			Level:      level,
			Method:     r.Method,
			Path:       r.URL.Path,
			Status:     rec.status,
			DurationMs: float64(dur),
			RequestID:  rid,
		}
		b, _ := json.Marshal(entry)
		println(string(b))
	})
}
