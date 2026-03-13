package api

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/access"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/atlas"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/auth"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/cami"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/chat"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/clima"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/feedback"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/noticias"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/radio"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/search"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/tiktok"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/traducir"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/tts"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/validate"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/video"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/youtube"
)

type Handlers struct {
	Auth      *auth.Service
	Search    *search.Service
	Video     *video.Service
	Chat      *chat.Service
	Cami      *cami.Service
	Feedback  *feedback.Service
	Access    *access.Service
	TikTok    *tiktok.Service
	TTS       *tts.Service
	Clima     *clima.Service
	Noticias  *noticias.Service
	Radio     *radio.Service
	Traducir  *traducir.Service
	YouTube   *youtube.Service
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
	atlas.Emit("Solicitud de acceso creada en RAULI-VISION", "med", "rauli-vision.access", map[string]interface{}{
		"request_id": request.ID,
		"role":       request.Role,
		"source_ip":  request.RequesterIP,
	})
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

// PostPresence — endpoint público (sin auth). El cliente lo llama cada 30s para
// indicar que está activo. Solo actualiza un mapa en memoria, no escribe disco.
func (h *Handlers) PostPresence(w http.ResponseWriter, r *http.Request) {
	if h.Access == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "access_unavailable"})
		return
	}
	code := strings.TrimPrefix(r.URL.Path, "/api/access/presence/")
	code = strings.TrimSuffix(code, "/")
	code = strings.TrimSpace(code)
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code_required"})
		return
	}
	if !h.Access.Ping(code) {
		// Código desconocido — responder 200 de todas formas para no filtrar info
		writeJSON(w, http.StatusOK, map[string]string{"ok": "false"})
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
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
	atlas.Emit("Solicitud de video registrada en RAULI-VISION", "low", "rauli-vision.video", map[string]interface{}{
		"video_id": id,
		"job_id":   jobID,
		"quality":  body.Quality,
		"status":   status,
	})
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
	mode := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("mode")))
	cubaMode := mode == "cuba" || mode == "cu" || mode == "proxy"
	target, ok := h.Video.StreamURL(id, cubaMode)
	if !ok || strings.TrimSpace(target) == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": "canal no disponible"})
		return
	}
	if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("format")), "json") {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id":         id,
			"mode":       map[bool]string{true: "cuba", false: "direct"}[cubaMode],
			"stream_url": target,
		})
		return
	}
	http.Redirect(w, r, target, http.StatusTemporaryRedirect)
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

func (h *Handlers) GetVideoChannelsHealth(w http.ResponseWriter, r *http.Request) {
	max, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("max")))
	mode := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("mode")))
	cubaMode := mode == "cuba" || mode == "cu" || mode == "proxy"
	data, err := h.Video.ChannelsHealthJSON(max, cubaMode)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal", "message": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
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
func (h *Handlers) streamCamiSong(w http.ResponseWriter, r *http.Request) {
	h.Cami.HandleStreamSong(w, r)
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

// ── TikTok proxy handlers ─────────────────────────────────────────────────────
// Permiten a usuarios en Cuba (donde tiktok.com está geo-restringido) acceder
// a videos de TikTok a través del espejo, que sí tiene acceso.

// GetTikTokStatus informa si yt-dlp está disponible en el espejo.
func (h *Handlers) GetTikTokStatus(w http.ResponseWriter, r *http.Request) {
	available := h.TikTok != nil && h.TikTok.Available()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"available":   available,
		"cuba_bypass": true,
		"description": "Proxy de TikTok para regiones con acceso restringido (Cuba). Usa /api/tiktok/fetch?url=<tiktok_url>",
		"note":        map[bool]string{true: "yt-dlp detectado — proxy operativo", false: "yt-dlp no instalado — instala con: pip install yt-dlp"}[available],
	})
}

// GetTikTokFetch extrae metadatos y URL de stream de un video TikTok.
// Query param: url (URL completa del video en tiktok.com)
func (h *Handlers) GetTikTokFetch(w http.ResponseWriter, r *http.Request) {
	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "bad_request",
			"message": "parámetro 'url' requerido (URL del video de TikTok)",
		})
		return
	}
	if h.TikTok == nil || !h.TikTok.Available() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":   "ytdlp_unavailable",
			"message": "yt-dlp no está instalado en el espejo. Instala con: pip install yt-dlp",
		})
		return
	}
	info, err := h.TikTok.FetchInfo(rawURL)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error":   "fetch_failed",
			"message": err.Error(),
		})
		return
	}
	atlas.Emit("TikTok video proxy solicitado", "low", "rauli-vision.tiktok", map[string]interface{}{
		"video_id": info.ID,
		"uploader": info.Uploader,
	})
	writeJSON(w, http.StatusOK, info)
}

// GetTikTokStream hace proxy del stream de video directamente al cliente.
// Esto evita que el cliente (en Cuba) tenga que conectarse a CDNs de TikTok.
// Query param: url (URL directa del stream, obtenida de /api/tiktok/fetch)
func (h *Handlers) GetTikTokStream(w http.ResponseWriter, r *http.Request) {
	streamURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if streamURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "bad_request",
			"message": "parámetro 'url' requerido (stream_url de /api/tiktok/fetch)",
		})
		return
	}
	if h.TikTok == nil {
		http.Error(w, "servicio no disponible", http.StatusServiceUnavailable)
		return
	}
	h.TikTok.ProxyStream(w, streamURL)
}

// GetTikTokTrending devuelve el feed de tendencias desde caché (o lo obtiene si está vacío).
func (h *Handlers) GetTikTokTrending(w http.ResponseWriter, r *http.Request) {
	if h.TikTok == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "service_unavailable", "message": "Servicio TikTok no disponible"})
		return
	}
	items, cachedAt := h.TikTok.TrendingCached()
	// Si el caché está vacío, hacer llamada directa
	if len(items) == 0 {
		count, _ := strconv.Atoi(r.URL.Query().Get("count"))
		var err error
		items, _, _, err = h.TikTok.FetchTrending(count, "")
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "fetch_failed", "message": err.Error()})
			return
		}
		cachedAt = time.Now()
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":     items,
		"cursor":    "",
		"has_more":  false,
		"cached_at": cachedAt.Format(time.RFC3339),
	})
}

// GetTikTokTrendingLive implementa SSE: envía el caché actual y luego empuja cada
// actualización automática al cliente en tiempo real (sin que el cliente haga polling).
func (h *Handlers) GetTikTokTrendingLive(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming no soportado", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no") // deshabilita buffering en nginx/cloudflare

	// Enviar caché actual inmediatamente.
	// Si está vacío (espejo recién arrancó o todos los APIs fallaron), hacer fetch directo
	// para que el cliente no quede colgado en "Conectando al feed en tiempo real...".
	items, cachedAt := h.TikTok.TrendingCached()
	if len(items) == 0 {
		if fetched, _, _, err := h.TikTok.FetchTrending(20, ""); err == nil && len(fetched) > 0 {
			items = fetched
			cachedAt = time.Now()
		}
	}
	if len(items) > 0 {
		payload, _ := json.Marshal(map[string]interface{}{
			"type":      "initial",
			"items":     items,
			"cached_at": cachedAt.Format(time.RFC3339),
		})
		fmt.Fprintf(w, "data: %s\n\n", payload)
		flusher.Flush()
	}

	ch := h.TikTok.TrendingSubscribe()
	defer h.TikTok.TrendingUnsubscribe(ch)

	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case newItems, alive := <-ch:
			if !alive {
				return
			}
			payload, _ := json.Marshal(map[string]interface{}{
				"type":      "update",
				"items":     newItems,
				"cached_at": time.Now().Format(time.RFC3339),
			})
			fmt.Fprintf(w, "data: %s\n\n", payload)
			flusher.Flush()
		}
	}
}

// GetTikTokSearch busca videos de TikTok por palabras clave.
// Query params: q (requerido), count (default 20), cursor (paginación)
func (h *Handlers) GetTikTokSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "parámetro 'q' requerido"})
		return
	}
	count, _ := strconv.Atoi(r.URL.Query().Get("count"))
	cursor := r.URL.Query().Get("cursor")
	if h.TikTok == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "service_unavailable", "message": "Servicio TikTok no disponible"})
		return
	}
	items, nextCursor, hasMore, err := h.TikTok.SearchVideos(q, count, cursor)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "fetch_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":    items,
		"cursor":   nextCursor,
		"has_more": hasMore,
		"query":    q,
	})
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

// ── Clima handlers ────────────────────────────────────────────────────────────

func (h *Handlers) GetClimaCities(w http.ResponseWriter, r *http.Request) {
	cities := h.Clima.ListCities()
	writeJSON(w, http.StatusOK, map[string]interface{}{"cities": cities})
}

func (h *Handlers) GetClima(w http.ResponseWriter, r *http.Request) {
	city := strings.TrimSpace(r.URL.Query().Get("city"))
	if city == "" {
		city = "La Habana"
	}
	data, err := h.Clima.FetchByCityJSON(city)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "clima_error", "message": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// ── Noticias handlers ─────────────────────────────────────────────────────────

func (h *Handlers) GetNoticiasFeedList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"feeds": h.Noticias.ListFeeds()})
}

func (h *Handlers) GetNoticias(w http.ResponseWriter, r *http.Request) {
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 30
	}
	// Si hay key específica en path /api/noticias/<key>
	path := strings.TrimPrefix(r.URL.Path, "/api/noticias")
	path = strings.Trim(path, "/")
	if path != "" {
		data, err := h.Noticias.FetchFeedJSON(path, limit)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "noticias_error", "message": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
		return
	}
	data, err := h.Noticias.FetchByCategoryJSON(category, limit)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "noticias_error", "message": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// ── Radio handlers ────────────────────────────────────────────────────────────

func (h *Handlers) GetRadioPopular(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	cc := strings.TrimSpace(r.URL.Query().Get("cc"))
	stations, err := h.Radio.Popular(limit, cc)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "radio_error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"stations": stations, "total": len(stations)})
}

func (h *Handlers) GetRadioSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "parámetro 'q' requerido"})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	stations, err := h.Radio.Search(q, limit)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "radio_error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"stations": stations, "total": len(stations), "query": q})
}

func (h *Handlers) GetRadioByCountry(w http.ResponseWriter, r *http.Request) {
	cc := strings.TrimSpace(r.URL.Query().Get("cc"))
	if cc == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "parámetro 'cc' requerido (código ISO del país)"})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	stations, err := h.Radio.ByCountry(cc, limit)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "radio_error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"stations": stations, "total": len(stations), "country_code": cc})
}

// ── Traducir handlers ─────────────────────────────────────────────────────────

func (h *Handlers) GetTraducirPairs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"pairs": h.Traducir.SupportedPairs()})
}

func (h *Handlers) PostTraducir(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text     string `json:"text"`
		LangPair string `json:"lang_pair"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "body JSON inválido"})
		return
	}
	if strings.TrimSpace(body.Text) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "campo 'text' requerido"})
		return
	}
	if strings.TrimSpace(body.LangPair) == "" {
		body.LangPair = "es|en"
	}
	result, err := h.Traducir.Translate(body.Text, body.LangPair)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "traducir_error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ── YouTube handlers ──────────────────────────────────────────────────────────

func (h *Handlers) GetYouTubeSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "parámetro 'q' requerido"})
		return
	}
	max, _ := strconv.Atoi(r.URL.Query().Get("max"))
	results, err := h.YouTube.Search(q, max)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "youtube_error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"query": q, "results": results, "total": len(results)})
}

func (h *Handlers) GetYouTubeStream(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "parámetro 'id' requerido"})
		return
	}
	si, err := h.YouTube.FetchStream(id)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "youtube_stream_error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, si)
}

func (h *Handlers) GetYouTubeProxy(w http.ResponseWriter, r *http.Request) {
	streamURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if streamURL == "" {
		http.Error(w, "parámetro 'url' requerido", http.StatusBadRequest)
		return
	}
	h.YouTube.ProxyStream(w, streamURL)
}

// PostTTS sintetiza texto a voz usando Gemini TTS y devuelve audio WAV al cliente.
// Body JSON: {"text": "..."}
// Respuesta: audio/wav — listo para reproducir directamente en el navegador.
func (h *Handlers) PostTTS(w http.ResponseWriter, r *http.Request) {
	if h.TTS == nil || !h.TTS.Available() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":   "tts_unavailable",
			"message": "Servicio TTS no disponible: configure GEMINI_API_KEY",
		})
		return
	}
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "body JSON inválido"})
		return
	}
	body.Text = strings.TrimSpace(body.Text)
	if body.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request", "message": "campo 'text' requerido"})
		return
	}
	wav, err := h.TTS.Synthesize(body.Text)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "tts_error", "message": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(wav)))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(wav)
}
