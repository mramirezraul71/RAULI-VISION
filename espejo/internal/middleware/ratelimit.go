package middleware

import (
	"net/http"
	"sync"
	"time"
)

// RateLimiter in-memory por IP; 60 req/min por defecto.
type RateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	if limit <= 0 {
		limit = 60
	}
	if window <= 0 {
		window = time.Minute
	}
	r := &RateLimiter{requests: make(map[string][]time.Time), limit: limit, window: window}
	go r.cleanup()
	return r
}

func (r *RateLimiter) cleanup() {
	tick := time.NewTicker(2 * time.Minute)
	defer tick.Stop()
	for range tick.C {
		r.mu.Lock()
		now := time.Now()
		for ip, ts := range r.requests {
			filtered := ts[:0]
			for _, t := range ts {
				if now.Sub(t) < r.window {
					filtered = append(filtered, t)
				}
			}
			if len(filtered) == 0 {
				delete(r.requests, ip)
			} else {
				r.requests[ip] = filtered
			}
		}
		r.mu.Unlock()
	}
}

func (r *RateLimiter) Allow(ip string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	ts := r.requests[ip]
	cut := now.Add(-r.window)
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

func (r *RateLimiter) Middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		ip := req.RemoteAddr
		if f := req.Header.Get("X-Forwarded-For"); f != "" {
			ip = f
		}
		if !r.Allow(ip) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"rate_limit","message":"Demasiadas peticiones. Espere un momento."}`))
			return
		}
		next(w, req)
	}
}
