package api

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/rauli-vision/cliente-local/internal/cache"
)

type Proxy struct {
	espejoURL    string
	clientID     string
	clientSecret string
	version      string
	token        string
	tokenExp     time.Time
	cache        *cache.Cache
	static       http.FileSystem
	client       *http.Client
}

func NewProxy(espejoURL, clientID, clientSecret, version string, c *cache.Cache, static http.FileSystem) *Proxy {
	if version == "" {
		version = "1.0.0"
	}
	return &Proxy{
		espejoURL:    strings.TrimSuffix(espejoURL, "/"),
		clientID:     clientID,
		clientSecret: clientSecret,
		version:      version,
		cache:        c,
		static:       static,
		client:       &http.Client{Timeout: 60 * time.Second},
	}
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" || r.URL.Path == "" || !strings.HasPrefix(r.URL.Path, "/api") {
		p.serveStatic(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api") {
		p.serveAPI(w, r)
		return
	}
	p.serveStatic(w, r)
}

func (p *Proxy) serveStatic(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		r.URL.Path = "/index.html"
	}
	_, err := p.static.Open(r.URL.Path)
	if err != nil {
		if r.URL.Path == "/index.html" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(staticFallbackHTML))
			return
		}
		http.NotFound(w, r)
		return
	}
	http.FileServer(p.static).ServeHTTP(w, r)
}

func (p *Proxy) serveAPI(w http.ResponseWriter, r *http.Request) {
	key := cache.CacheKey(r.Method, r.URL.Path, r.URL.RawQuery)
	if r.Method == http.MethodGet {
		if data, ok := p.cache.Get(key); ok {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("X-Cache", "HIT")
			w.Write(data)
			return
		}
	}

	needToken := r.URL.Path != "/api/health"
	var token string
	if needToken {
		var err error
		token, err = p.getToken()
		if err != nil {
			writeErr(w, http.StatusBadGateway, "espejo_no_disponible", "No se pudo conectar con el servidor espejo.")
			return
		}
	}

	url := p.espejoURL + r.URL.Path
	if r.URL.RawQuery != "" {
		url += "?" + r.URL.RawQuery
	}
	var bodyReader io.Reader
	if r.Body != nil {
		bodyReader = r.Body
	}
	req, err := http.NewRequest(r.Method, url, bodyReader)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if needToken && token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", r.Header.Get("Content-Type"))
	req.Header.Set("Accept-Encoding", "br, gzip")

	req.Header.Set("X-Request-ID", r.Header.Get("X-Request-ID"))
	resp, err := p.client.Do(req)
	if err != nil {
		if r.URL.Path == "/api/health" {
			p.writeHealth(w, map[string]interface{}{"status": "ok", "proxy": "ok", "espejo": "unreachable", "version": p.version})
			return
		}
		// Fallback para búsqueda cuando el espejo no responde: devolver resultado amigable en lugar de 502
		if r.Method == http.MethodGet && (r.URL.Path == "/api/search" || r.URL.Path == "/api/video/search") {
			q := r.URL.Query().Get("q")
			if q == "" {
				q = "búsqueda"
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			if r.URL.Path == "/api/search" {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"query":   q,
					"results": []map[string]string{{"title": "Servidor espejo no disponible", "url": "#", "snippet": "Arranque el espejo (puerto 8080) y vuelva a intentar. Mientras tanto, el proxy está activo."}},
					"cached":  false,
				})
			} else {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"results": []map[string]interface{}{{"id": "offline", "title": "Servidor espejo no disponible", "channel": "Arranque el espejo (puerto 8080)", "duration_sec": 0}},
					"cached":  false,
				})
			}
			return
		}
		writeErr(w, http.StatusBadGateway, "espejo_no_disponible", "No se pudo conectar con el servidor espejo.")
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "internal", "Error leyendo respuesta del espejo.")
		return
	}
	if enc := resp.Header.Get("Content-Encoding"); enc == "br" {
		br := brotli.NewReader(bytes.NewReader(body))
		body, _ = io.ReadAll(br)
	} else if enc == "gzip" {
		gr, _ := gzip.NewReader(bytes.NewReader(body))
		body, _ = io.ReadAll(gr)
		gr.Close()
	}

	// Búsqueda: si el espejo devuelve error (4xx/5xx), responder 200 con fallback para no mostrar "Búsqueda fallida"
	if r.Method == http.MethodGet && resp.StatusCode >= 400 && (r.URL.Path == "/api/search" || r.URL.Path == "/api/video/search") {
		q := r.URL.Query().Get("q")
		if q == "" {
			q = "búsqueda"
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("X-API-Version", p.version)
		w.WriteHeader(http.StatusOK)
		if r.URL.Path == "/api/search" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"query":   q,
				"results": []map[string]string{{"title": "El espejo devolvió un error. Puede buscar en DuckDuckGo.", "url": "https://duckduckgo.com/?q=" + url.QueryEscape(q), "snippet": "Reintente más tarde o use el enlace para buscar directamente."}},
				"cached":  false,
			})
		} else {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"results": []map[string]interface{}{{"id": "fallback", "title": "El espejo devolvió un error", "channel": "Reintente más tarde", "duration_sec": 0}},
				"cached":  false,
			})
		}
		return
	}

	// Health enriquecido: merge espejo + proxy + cache
	if r.URL.Path == "/api/health" && resp.StatusCode == http.StatusOK {
		var espejoHealth map[string]interface{}
		if err := json.Unmarshal(body, &espejoHealth); err == nil {
			espejoHealth["proxy"] = "ok"
			espejoHealth["espejo"] = "ok"
			p.writeHealth(w, espejoHealth)
			return
		}
	}

	for k, v := range resp.Header {
		if strings.ToLower(k) == "content-encoding" {
			continue
		}
		for _, vv := range v {
			w.Header().Add(k, vv)
		}
	}
	if v := resp.Header.Get("X-API-Version"); v != "" {
		w.Header().Set("X-API-Version", v)
	} else {
		w.Header().Set("X-API-Version", p.version)
	}
	w.Header().Set("X-Cache", "MISS")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)

	if r.Method == http.MethodGet && resp.StatusCode == http.StatusOK && len(body) > 0 && len(body) < 500*1024 {
		p.cache.Set(key, body, 1*time.Hour)
	}
}

func (p *Proxy) getToken() (string, error) {
	if p.token != "" && time.Now().Before(p.tokenExp) {
		return p.token, nil
	}
	body, _ := json.Marshal(map[string]string{"client_id": p.clientID, "client_secret": p.clientSecret})
	req, err := http.NewRequest(http.MethodPost, p.espejoURL+"/auth/token", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.Token == "" {
		return "", fmt.Errorf("token vacío")
	}
	p.token = out.Token
	p.tokenExp = time.Now().Add(50 * time.Minute)
	return p.token, nil
}

// writeHealth writes a health JSON response with proxy version and cache stats.
func (p *Proxy) writeHealth(w http.ResponseWriter, out map[string]interface{}) {
	entries, sizeBytes := p.cache.Stats()
	out["version"] = p.version
	out["cache_entries"] = entries
	out["cache_size_bytes"] = sizeBytes
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-API-Version", p.version)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(out)
}

func writeErr(w http.ResponseWriter, code int, errCode, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": errCode, "message": msg})
}

const staticFallbackHTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RAULI-VISION</title>
<style>
body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;margin:2rem;text-align:center;}
h1{color:#58a6ff;}
a{color:#58a6ff;}
</style>
</head>
<body>
<h1>RAULI-VISION</h1>
<p>Cliente local activo. Para el dashboard completo, construya el frontend y copie <code>dashboard/dist</code> a <code>cliente-local/static/</code>.</p>
<p><a href="/api/health">Estado API</a></p>
</body>
</html>`
