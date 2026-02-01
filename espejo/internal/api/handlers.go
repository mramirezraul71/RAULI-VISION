package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/rauli-vision/espejo/internal/auth"
	"github.com/rauli-vision/espejo/internal/cami"
	"github.com/rauli-vision/espejo/internal/chat"
	"github.com/rauli-vision/espejo/internal/search"
	"github.com/rauli-vision/espejo/internal/validate"
	"github.com/rauli-vision/espejo/internal/video"
)

type Handlers struct {
	Auth    *auth.Service
	Search  *search.Service
	Video   *video.Service
	Chat    *chat.Service
	Cami    *cami.Service
	Version string
}

func (h *Handlers) PostAuthToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "body inválido"})
		return
	}
	token, exp, err := h.Auth.IssueToken(body.ClientID, body.ClientSecret)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"token": token, "expires_at": exp.Format("2006-01-02T15:04:05Z07:00")})
}

func (h *Handlers) GetHealth(w http.ResponseWriter, r *http.Request) {
	out := map[string]string{"status": "ok"}
	if h.Version != "" {
		out["version"] = h.Version
	}
	w.Header().Set("X-API-Version", h.Version)
	writeJSON(w, http.StatusOK, out)
}

func (h *Handlers) GetSearch(w http.ResponseWriter, r *http.Request) {
	q, ok := validate.SearchQuery(r.URL.Query().Get("q"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "parámetro 'q' obligatorio"})
		return
	}
	max, _ := strconv.Atoi(r.URL.Query().Get("max"))
	if max > 50 {
		max = 50
	}
	data, err := h.Search.SearchJSON(q, max)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal", "message": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (h *Handlers) GetVideoSearch(w http.ResponseWriter, r *http.Request) {
	q, _ := validate.SearchQuery(r.URL.Query().Get("q"))
	max, _ := strconv.Atoi(r.URL.Query().Get("max"))
	if max > 30 {
		max = 30
	}
	data, err := h.Video.SearchJSON(q, max)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal", "message": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (h *Handlers) GetVideoMeta(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/video/")
	id = strings.TrimSuffix(id, "/")
	if idx := strings.Index(id, "/"); idx >= 0 {
		id = id[:idx]
	}
	id, ok := validate.VideoID(id)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "id de video inválido"})
		return
	}
	meta, ok := h.Video.Meta(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": "video no encontrado"})
		return
	}
	writeJSON(w, http.StatusOK, meta)
}

func (h *Handlers) PostVideoRequest(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/video/")
	id = strings.TrimSuffix(id, "/request")
	id = strings.TrimSuffix(id, "/")
	if idx := strings.Index(id, "/"); idx >= 0 {
		id = id[:idx]
	}
	id, ok := validate.VideoID(id)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "id de video inválido"})
		return
	}
	var body struct {
		Quality string `json:"quality"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Quality == "" {
		body.Quality = "360p"
	}
	jobID, status, err := h.Video.Request(id, body.Quality)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"job_id":  jobID,
		"status":  status,
		"message": "Video en cola, puede tardar unos minutos.",
	})
}

func (h *Handlers) GetVideoStream(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/video/")
	id = strings.TrimSuffix(id, "/stream")
	id = strings.TrimSuffix(id, "/")
	if idx := strings.Index(id, "/"); idx >= 0 {
		id = id[:idx]
	}
	if id == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": "id requerido"})
		return
	}
	writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "not_implemented", "message": "Stream en desarrollo; use descarga cuando el video esté listo."})
}

func (h *Handlers) GetVideoStatus(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/video/")
	id = strings.TrimSuffix(id, "/status")
	id = strings.TrimSuffix(id, "/")
	if idx := strings.Index(id, "/"); idx >= 0 {
		id = id[:idx]
	}
	jobID := r.URL.Query().Get("job_id")
	if id == "" || jobID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "id y job_id requeridos"})
		return
	}
	st, ok := h.Video.Status(jobID, id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": "job no encontrado"})
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handlers) PostChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Message    string `json:"message"`
		ContextURL string `json:"context_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "body inválido"})
		return
	}
	msg, ok := validate.ChatMessage(body.Message)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "campo 'message' obligatorio"})
		return
	}
	ctxURL, _ := validate.ContextURL(body.ContextURL)
	data, err := h.Chat.ChatJSON(msg, ctxURL)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal", "message": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (h *Handlers) GetChatHistory(w http.ResponseWriter, r *http.Request) {
	max, _ := strconv.Atoi(r.URL.Query().Get("max"))
	if max <= 0 {
		max = 20
	}
	data, err := h.Chat.HistoryJSON(max)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal", "message": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
