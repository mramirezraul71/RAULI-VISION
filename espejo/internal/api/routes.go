package api

import (
	"net/http"
	"strings"

	"github.com/rauli-vision/espejo/internal/auth"
	"github.com/rauli-vision/espejo/internal/chat"
	"github.com/rauli-vision/espejo/internal/middleware"
	"github.com/rauli-vision/espejo/internal/search"
	"github.com/rauli-vision/espejo/internal/video"
)

func Register(mux *http.ServeMux, version string, authSvc *auth.Service, searchSvc *search.Service, videoSvc *video.Service, chatSvc *chat.Service, rl *middleware.RateLimiter) {
	h := &Handlers{
		Auth:    authSvc,
		Search:  searchSvc,
		Video:   videoSvc,
		Chat:    chatSvc,
		Version: version,
	}
	wrap := brotliMiddleware
	logWrap := middleware.Logging
	rateWrap := func(f http.HandlerFunc) http.HandlerFunc {
		if rl != nil {
			return rl.Middleware(f)
		}
		return f
	}
	chain := func(f http.HandlerFunc) http.HandlerFunc {
		return rateWrap(logWrap(wrap(optionalAuth(authSvc, f))))
	}

	mux.HandleFunc("POST /auth/token", rateWrap(logWrap(h.PostAuthToken)))
	mux.HandleFunc("GET /api/health", rateWrap(logWrap(h.GetHealth)))
	mux.HandleFunc("GET /api/search", chain(h.getSearch))
	mux.HandleFunc("GET /api/video/search", chain(h.getVideoSearch))
	mux.HandleFunc("/api/video/", chain(h.serveVideo))
	mux.HandleFunc("POST /api/video/", chain(h.serveVideoPost))
	mux.HandleFunc("POST /api/chat", chain(h.postChat))
	mux.HandleFunc("GET /api/chat/history", chain(h.getChatHistory))
}

func (h *Handlers) getSearch(w http.ResponseWriter, r *http.Request) { h.GetSearch(w, r) }
func (h *Handlers) getVideoSearch(w http.ResponseWriter, r *http.Request) { h.GetVideoSearch(w, r) }
func (h *Handlers) postChat(w http.ResponseWriter, r *http.Request) { h.PostChat(w, r) }
func (h *Handlers) getChatHistory(w http.ResponseWriter, r *http.Request) { h.GetChatHistory(w, r) }

func (h *Handlers) serveVideo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/video/")
	path = strings.TrimSuffix(path, "/")
	parts := strings.SplitN(path, "/", 2)
	id := parts[0]
	if id == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": "id requerido"})
		return
	}
	if len(parts) > 1 {
		switch parts[1] {
		case "status":
			h.GetVideoStatus(w, r)
			return
		case "stream":
			h.GetVideoStream(w, r)
			return
		}
	}
	h.GetVideoMeta(w, r)
}

func (h *Handlers) serveVideoPost(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/video/")
	path = strings.TrimSuffix(path, "/request")
	path = strings.TrimSuffix(path, "/")
	id := strings.SplitN(path, "/", 2)[0]
	if id == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": "id requerido"})
		return
	}
	r.URL.Path = "/api/video/" + id + "/request"
	h.PostVideoRequest(w, r)
}

func optionalAuth(authSvc *auth.Service, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authH := r.Header.Get("Authorization")
		if authH != "" && strings.HasPrefix(authH, "Bearer ") {
			_, _ = authSvc.ValidateToken(strings.TrimPrefix(authH, "Bearer "))
		}
		next(w, r)
	}
}
