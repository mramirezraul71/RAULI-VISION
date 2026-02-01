package middleware

import (
	"net/http"
	"sync"
	"time"
)

type RateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	if limit <= 0 {
		limit = 180
	}
	if window <= 0 {
		window = time.Minute
	}
	return &RateLimiter{requests: make(map[string][]time.Time), limit: limit, window: window}
}

func (r *RateLimiter) Allow(ip string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	cut := now.Add(-r.window)
	ts := r.requests[ip]
	i := 0
	for _, t := range ts {
		if t.After(cut) {
			ts[i] = t
			i++
		}
	}
	ts = ts[:i]
	if len(ts) >= r.limit {
		return false
	}
	r.requests[ip] = append(ts, now)
	return true
}

func (r *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		ip := req.RemoteAddr
		if f := req.Header.Get("X-Forwarded-For"); f != "" {
			ip = f
		}
		if !r.Allow(ip) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"rate_limit","message":"Demasiadas peticiones."}`))
			return
		}
		next.ServeHTTP(w, req)
	})
}
