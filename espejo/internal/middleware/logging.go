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

func Logging(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rid := r.Header.Get("X-Request-ID")
		if rid == "" {
			rid = r.Header.Get("X-Correlation-ID")
		}
		rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next(rec, r)
		dur := time.Since(start).Milliseconds()
		entry := logEntry{
			Time:       time.Now().UTC().Format(time.RFC3339),
			Level:      "info",
			Method:     r.Method,
			Path:       r.URL.Path,
			Status:     rec.status,
			DurationMs: float64(dur),
			RequestID:  rid,
		}
		if rec.status >= 500 {
			entry.Level = "error"
		} else if rec.status >= 400 {
			entry.Level = "warn"
		}
		b, _ := json.Marshal(entry)
		println(string(b))
	}
}

type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (r *responseRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}
