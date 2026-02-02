package api

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/access"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/auth"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/cami"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/chat"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/feedback"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/search"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/validate"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/video"
)

type Handlers struct {
	Auth       *auth.Service
	Search     *search.Service
	Video      *video.Service
	Chat       *chat.Service
	Cami       *cami.Service
	Feedback   *feedback.Service
	Access     *access.Service
	Version    string
	AdminToken string
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

func (h *Handlers) PostAccessRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.Access == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "access_unavailable", "message": "Servicio de accesos no disponible"})
		return
	}
	var body struct {
		Name         string `json:"name"`
		Email        string `json:"email"`
		Role         string `json:"role"`
		Organization string `json:"organization"`
		Message      string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "body inválido"})
		return
	}
	request, err := h.Access.CreateRequest(access.RequestInput{
		Name:         body.Name,
		Email:        body.Email,
		Role:         body.Role,
		Organization: body.Organization,
		Message:      body.Message,
		RequesterIP:  clientIP(r),
		UserAgent:    r.UserAgent(),
	})
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"request": request})
}

func (h *Handlers) ListAccessRequests(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeAdmin(w, r) {
		return
	}
	status := r.URL.Query().Get("status")
	items := h.Access.ListRequests(status)
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": items, "total": len(items)})
}

func (h *Handlers) HandleAccessRequestAction(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeAdmin(w, r) {
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/access/requests/")
	path = strings.TrimSuffix(path, "/")
	parts := strings.SplitN(path, "/", 2)
	if len(parts) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "acción inválida"})
		return
	}
	id := strings.TrimSpace(parts[0])
	action := strings.TrimSpace(parts[1])
	if id == "" || action == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "acción inválida"})
		return
	}

	var body struct {
		Note      string `json:"note"`
		DecidedBy string `json:"decided_by"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	decidedBy := strings.TrimSpace(body.DecidedBy)
	if decidedBy == "" {
		decidedBy = strings.TrimSpace(r.Header.Get("X-Admin-Name"))
	}

	switch action {
	case "approve":
		req, user, err := h.Access.ApproveRequest(id, body.Note, decidedBy)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"request": req, "user": user})
	case "reject":
		req, err := h.Access.RejectRequest(id, body.Note, decidedBy)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"request": req})
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": "acción no disponible"})
	}
}

func (h *Handlers) ListAccessUsers(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeAdmin(w, r) {
		return
	}
	status := r.URL.Query().Get("status")
	items := h.Access.ListUsers(status)
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": items, "total": len(items)})
}

func (h *Handlers) HandleAccessUserAction(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeAdmin(w, r) {
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/access/users/")
	path = strings.TrimSuffix(path, "/")
	id := strings.TrimSpace(path)
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "id requerido"})
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "body inválido"})
		return
	}
	user, err := h.Access.SetUserStatus(id, body.Status)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"user": user})
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

func (h *Handlers) getPopularCamiSongs(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleGetPopularSongs(w, r)
}

// Feedback AI handlers
func (h *Handlers) processFeedback(w http.ResponseWriter, r *http.Request) {
	h.Feedback.ProcessFeedback(w, r)
}

func (h *Handlers) getFeedbackStats(w http.ResponseWriter, r *http.Request) {
	h.Feedback.HandleFeedbackStats(w, r)
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func (h *Handlers) authorizeAdmin(w http.ResponseWriter, r *http.Request) bool {
	if h.Access == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "access_unavailable", "message": "Servicio de accesos no disponible"})
		return false
	}
	if strings.TrimSpace(h.AdminToken) == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "admin_not_configured", "message": "Token de administración no configurado"})
		return false
	}
	adminToken := strings.TrimSpace(r.Header.Get("X-Admin-Token"))
	if strings.HasPrefix(strings.ToLower(adminToken), "bearer ") {
		adminToken = strings.TrimSpace(adminToken[7:])
	}
	if adminToken == "" || adminToken != h.AdminToken {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "admin_unauthorized", "message": "Token de administración inválido o ausente"})
		return false
	}
	return true
}

func clientIP(r *http.Request) string {
	if fwd := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); fwd != "" {
		parts := strings.Split(fwd, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// CAMI Channel handlers
func (h *Handlers) getCamiSongs(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleGetSongs(w, r)
}

func (h *Handlers) getCamiSong(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleGetSong(w, r)
}

func (h *Handlers) createCamiSong(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleCreateSong(w, r)
}

func (h *Handlers) updateCamiSong(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleUpdateSong(w, r)
}

func (h *Handlers) deleteCamiSong(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleDeleteSong(w, r)
}

func (h *Handlers) playCamiSong(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandlePlaySong(w, r)
}

func (h *Handlers) getCamiAlbums(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleGetAlbums(w, r)
}

func (h *Handlers) getCamiAlbum(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleGetAlbum(w, r)
}

func (h *Handlers) createCamiAlbum(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleCreateAlbum(w, r)
}

func (h *Handlers) getCamiStats(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleGetStats(w, r)
}

func (h *Handlers) searchCami(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleSearch(w, r)
}

func (h *Handlers) uploadCami(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleUpload(w, r)
}
