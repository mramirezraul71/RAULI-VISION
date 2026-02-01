package api

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"

	"github.com/andybalholm/brotli"
)

func brotliMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ae := r.Header.Get("Accept-Encoding")
		if strings.Contains(ae, "br") {
			bw := brotli.NewWriterLevel(w, brotli.BestSpeed)
			defer bw.Close()
			w.Header().Set("Content-Encoding", "br")
			w = &responseWriter{Writer: bw, ResponseWriter: w, status: http.StatusOK}
		} else if strings.Contains(ae, "gzip") {
			gw := gzip.NewWriter(w)
			defer gw.Close()
			w.Header().Set("Content-Encoding", "gzip")
			w = &responseWriter{Writer: gw, ResponseWriter: w, status: http.StatusOK}
		}
		next(w, r)
	}
}

type responseWriter struct {
	io.Writer
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}
