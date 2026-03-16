package api

import (
	"net/http"
	"os"
	"strings"

	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/access"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/auth"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/cami"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/chat"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/clima"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/digest"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/divisas"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/feedback"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/store"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/middleware"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/noticias"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/owner"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/radio"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/search"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/tiktok"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/traducir"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/tts"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/vault"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/video"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/youtube"
)

func Register(mux *http.ServeMux, version string, authSvc *auth.Service, searchSvc *search.Service, videoSvc *video.Service, chatSvc *chat.Service, accessSvc *access.Service, adminToken string, rl *middleware.RateLimiter, ttsSvc *tts.Service) {
	camiSvc     := cami.New()
	feedbackSvc := feedback.New()
	tiktokSvc   := tiktok.New()
	climaSvc    := clima.New()
	noticiasSvc := noticias.New()
	radioSvc    := radio.New()
	traducirSvc := traducir.New()
	youtubeSvc  := youtube.New()
	// SQLite store — persiste tasas de cambio + histórico de resúmenes
	dbPath := os.Getenv("RAULI_DB_PATH")
	if dbPath == "" {
		dbPath = "data/rauli.db"
	}
	db, dbErr := store.Open(dbPath)
	if dbErr != nil {
		// No fatal: los servicios continúan sin persistencia SQLite
		db = nil
	}

	divisasSvc  := divisas.New(db)
	geminiKey   := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	digestSvc   := digest.New(geminiKey, noticiasSvc, climaSvc, db)

	// Inicializar Owner panel (bus de eventos + canal de tareas)
	ownerSvc := owner.Init(adminToken, geminiKey)

	// Vault — catálogo de contenido offline (2 canales: cami + variado)
	vaultSvc := vault.New(adminToken)
	vaultSvc.StartRotationWorker()
	vaultSvc.StartScanWorker()  // auto-indexa archivos colocados en VAULT_ROOT
	vaultSvc.StartSeedWorker()  // descarga contenido de YouTube según VAULT_SEED_* env vars

	h := &Handlers{
		Auth:       authSvc,
		Search:     searchSvc,
		Video:      videoSvc,
		Chat:       chatSvc,
		Cami:       camiSvc,
		Feedback:   feedbackSvc,
		Access:     accessSvc,
		TikTok:     tiktokSvc,
		TTS:        ttsSvc,
		Clima:      climaSvc,
		Noticias:   noticiasSvc,
		Radio:      radioSvc,
		Traducir:   traducirSvc,
		YouTube:    youtubeSvc,
		Digest:     digestSvc,
		Divisas:    divisasSvc,
		Vault:      vaultSvc,
		Version:    version,
		AdminToken: strings.TrimSpace(adminToken),
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
		return rateWrap(logWrap(wrap(requireAuth(authSvc, accessSvc, f))))
	}

	mux.HandleFunc("POST /auth/token", rateWrap(logWrap(h.PostAuthToken)))
	mux.HandleFunc("GET /api/health", rateWrap(logWrap(h.GetHealth)))
	mux.HandleFunc("POST /api/access/requests", rateWrap(logWrap(wrap(h.PostAccessRequest))))
	mux.HandleFunc("POST /api/access/validate", rateWrap(logWrap(wrap(h.PostAccessValidate)))) // público — verifica si un código es válido
	mux.HandleFunc("GET /api/access/requests", rateWrap(logWrap(wrap(h.ListAccessRequests))))
	mux.HandleFunc("POST /api/access/requests/", rateWrap(logWrap(wrap(h.HandleAccessRequestAction))))
	mux.HandleFunc("GET /api/access/users", rateWrap(logWrap(wrap(h.ListAccessUsers))))
	mux.HandleFunc("PUT /api/access/users/", rateWrap(logWrap(wrap(h.HandleAccessUserAction))))
	mux.HandleFunc("POST /api/access/users/direct", rateWrap(logWrap(wrap(h.PostAccessDirectCreate)))) // owner crea usuario directamente
	mux.HandleFunc("POST /api/access/presence/", rateWrap(logWrap(h.PostPresence))) // sin auth, solo heartbeat
	mux.HandleFunc("GET /api/search", chain(h.getSearch))
	mux.HandleFunc("GET /api/video/search", chain(h.getVideoSearch))
	mux.HandleFunc("GET /api/video/channels/health", chain(h.getVideoChannelsHealth))
	mux.HandleFunc("/api/video/", chain(h.serveVideo))
	mux.HandleFunc("POST /api/video/", chain(h.serveVideoPost))
	mux.HandleFunc("POST /api/chat", chain(h.postChat))
	mux.HandleFunc("GET /api/chat/history", chain(h.getChatHistory))

	// CAMI Channel routes
	mux.HandleFunc("GET /api/cami/songs", chain(h.getCamiSongs))
	mux.HandleFunc("GET /api/cami/songs/", chain(h.getCamiSong))
	mux.HandleFunc("POST /api/cami/songs", chain(h.createCamiSong))
	mux.HandleFunc("PUT /api/cami/songs/", chain(h.updateCamiSong))
	mux.HandleFunc("DELETE /api/cami/songs/", chain(h.deleteCamiSong))
	mux.HandleFunc("POST /api/cami/songs/", chain(h.playCamiSong))
	mux.HandleFunc("GET /api/cami/albums", chain(h.getCamiAlbums))
	mux.HandleFunc("GET /api/cami/albums/", chain(h.getCamiAlbum))
	mux.HandleFunc("POST /api/cami/albums", chain(h.createCamiAlbum))
	mux.HandleFunc("GET /api/cami/stats", chain(h.getCamiStats))
	mux.HandleFunc("GET /api/cami/search", chain(h.searchCami))
	mux.HandleFunc("POST /api/cami/upload", chain(h.uploadCami))
	mux.HandleFunc("GET /api/cami/popular", chain(h.getPopularCamiSongs))
	mux.HandleFunc("GET /api/cami/stream/", h.streamCamiSong) // stream sin brotli: audio binario

	// Feedback AI routes
	mux.HandleFunc("POST /api/feedback/brain", chain(h.processFeedback))
	mux.HandleFunc("GET /api/feedback/stats", chain(h.getFeedbackStats))

	// TikTok proxy — acceso para regiones con restricción geopolítica (Cuba)
	// GET /api/tiktok/status        → estado del proxy (yt-dlp disponible?)
	// GET /api/tiktok/fetch?url=... → extrae info + stream_url de un video TikTok
	// GET /api/tiktok/stream?url=.. → retransmite el stream directamente al cliente
	mux.HandleFunc("GET /api/tiktok/status", chain(h.GetTikTokStatus))
	mux.HandleFunc("GET /api/tiktok/trending", chain(h.GetTikTokTrending))
	mux.HandleFunc("GET /api/tiktok/trending/live", rateWrap(logWrap(h.GetTikTokTrendingLive))) // SSE — sin brotli
	mux.HandleFunc("GET /api/tiktok/search", chain(h.GetTikTokSearch))
	mux.HandleFunc("GET /api/tiktok/fetch", chain(h.GetTikTokFetch))
	mux.HandleFunc("GET /api/tiktok/stream", h.GetTikTokStream) // sin brotli: es stream binario

	// TTS (Text-to-Speech) — Gemini 2.5 Flash Preview TTS, voz Aoede
	// POST /api/tts  body: {"text":"..."} → audio/wav
	mux.HandleFunc("POST /api/tts", rateWrap(logWrap(wrap(h.PostTTS))))

	// ── Clima — Open-Meteo, sin API key ──────────────────────────────────────
	mux.HandleFunc("GET /api/clima/cities", chain(h.GetClimaCities))
	mux.HandleFunc("GET /api/clima", chain(h.GetClima))

	// ── Noticias — RSS agregador, sin API key ─────────────────────────────────
	mux.HandleFunc("GET /api/noticias/feeds", chain(h.GetNoticiasFeedList))
	mux.HandleFunc("GET /api/noticias", chain(h.GetNoticias))
	mux.HandleFunc("GET /api/noticias/", chain(h.GetNoticias)) // /api/noticias/<key>

	// ── Radio — Radio Browser API, sin API key ────────────────────────────────
	mux.HandleFunc("GET /api/radio/popular", chain(h.GetRadioPopular))
	mux.HandleFunc("GET /api/radio/search", chain(h.GetRadioSearch))
	mux.HandleFunc("GET /api/radio/country", chain(h.GetRadioByCountry))

	// ── Traducir — MyMemory API, sin API key obligatoria ─────────────────────
	mux.HandleFunc("GET /api/traducir/pairs", chain(h.GetTraducirPairs))
	mux.HandleFunc("POST /api/traducir", rateWrap(logWrap(wrap(h.PostTraducir))))

	// ── YouTube — Invidious + Cobalt, sin API key ─────────────────────────────
	mux.HandleFunc("GET /api/youtube/search", chain(h.GetYouTubeSearch))
	mux.HandleFunc("GET /api/youtube/stream", chain(h.GetYouTubeStream))
	mux.HandleFunc("GET /api/youtube/proxy", h.GetYouTubeProxy) // stream binario — sin brotli

	// ── HLS proxy — proxifica m3u8 + segmentos para TV en vivo ────────────────
	// GET /api/video/hls?url=<encoded> → proxy HLS transparente (reescribe URIs internas)
	mux.HandleFunc("GET /api/video/hls", h.GetVideoHLSProxy) // sin brotli: binario/m3u8

	// ── Owner Panel — monitor de actividad + canal de tareas (requiere X-Admin-Token) ──
	// GET  /api/owner/activity → SSE stream de eventos de usuarios en tiempo real
	// GET  /api/owner/recent   → últimos 50 eventos (REST fallback)
	// POST /api/owner/task     → envía tarea a Gemini, recibe respuesta
	mux.HandleFunc("GET /api/owner/activity", logWrap(ownerSvc.ServeActivity)) // SSE sin brotli
	mux.HandleFunc("GET /api/owner/recent",   logWrap(wrap(ownerSvc.ServeRecent)))
	mux.HandleFunc("POST /api/owner/task",    rateWrap(logWrap(wrap(ownerSvc.ServeTask))))

	// ── Digest — Resumen del día: noticias + clima + Gemini ───────────────────
	mux.HandleFunc("GET /api/digest", chain(h.GetDigest))
	mux.HandleFunc("GET /api/digest/history", chain(h.GetDigestHistory))

	// ── Divisas — Tasas informales USD/EUR/MLC en CUP (elToque, caché 4h) ─────
	mux.HandleFunc("GET /api/divisas", chain(h.GetDivisas))
	mux.HandleFunc("POST /api/divisas/refresh", rateWrap(logWrap(wrap(h.PostDivisasRefresh))))

	// ── Vault — catálogo de contenido offline (2 canales: cami | variado) ─────
	// GET  /api/vault/catalog                → lista items activos (channel, category, genre, q)
	// GET  /api/vault/stream/{id}            → stream binario con Range requests
	// POST /api/vault/admin/upload           → subir archivo (X-Admin-Token)
	// POST /api/vault/admin/rotate           → forzar rotación de slot (X-Admin-Token)
	// GET  /api/vault/admin/status           → estado del vault (X-Admin-Token)
	// DELETE /api/vault/admin/item/{id}      → eliminar item (X-Admin-Token)
	mux.HandleFunc("GET /api/vault/catalog",        chain(h.GetVaultCatalog))
	mux.HandleFunc("/api/vault/stream/",            h.StreamVaultItem) // sin brotli: binario
	mux.HandleFunc("POST /api/vault/admin/upload",  rateWrap(logWrap(h.PostVaultUpload)))
	mux.HandleFunc("POST /api/vault/admin/rotate",  rateWrap(logWrap(h.PostVaultRotate)))
	mux.HandleFunc("GET /api/vault/admin/status",   rateWrap(logWrap(h.GetVaultStatus)))
	mux.HandleFunc("DELETE /api/vault/admin/item/", rateWrap(logWrap(h.DeleteVaultItem)))
}

func (h *Handlers) getSearch(w http.ResponseWriter, r *http.Request)      { h.GetSearch(w, r) }
func (h *Handlers) getVideoSearch(w http.ResponseWriter, r *http.Request) { h.GetVideoSearch(w, r) }
func (h *Handlers) getVideoChannelsHealth(w http.ResponseWriter, r *http.Request) {
	h.GetVideoChannelsHealth(w, r)
}
func (h *Handlers) postChat(w http.ResponseWriter, r *http.Request)       { h.PostChat(w, r) }
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

// requireAuth verifica que la petición incluya un código de acceso válido.
// Identifica al usuario por dos vías:
//  1. JWT Bearer token (client_id == access_code)
//  2. Query param ?u=ACCESS_CODE (para clientes sin JWT)
//
// Si el código no pertenece a ningún usuario activo → 401 Unauthorized.
// Si es válido → registra presencia y delega en el siguiente handler.
func requireAuth(authSvc *auth.Service, accessSvc *access.Service, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if accessSvc == nil {
			// Sin servicio de accesos configurado: dejar pasar (modo permisivo)
			next(w, r)
			return
		}

		var code string

		// Vía 1: JWT Bearer
		if authH := r.Header.Get("Authorization"); authH != "" && strings.HasPrefix(authH, "Bearer ") {
			if clientID, err := authSvc.ValidateToken(strings.TrimPrefix(authH, "Bearer ")); err == nil && clientID != "" {
				code = clientID
			}
		}

		// Vía 2: ?u=ACCESS_CODE
		if code == "" {
			code = strings.TrimSpace(r.URL.Query().Get("u"))
		}

		if !accessSvc.ValidateUser(code) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("X-Auth-Required", "access_code")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"unauthorized","message":"Acceso restringido. Usa tu enlace personalizado o solicita acceso al administrador."}`))
			return
		}

		// Código válido — registrar presencia
		accessSvc.Ping(code)
		next(w, r)
	}
}
