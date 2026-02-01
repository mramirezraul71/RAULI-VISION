package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
)

const headerRequestID = "X-Request-ID"

func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(headerRequestID)
		if id == "" {
			id = r.Header.Get("X-Correlation-ID")
		}
		if id == "" {
			b := make([]byte, 8)
			rand.Read(b)
			id = hex.EncodeToString(b)
		}
		w.Header().Set(headerRequestID, id)
		r.Header.Set(headerRequestID, id)
		next.ServeHTTP(w, r)
	})
}
