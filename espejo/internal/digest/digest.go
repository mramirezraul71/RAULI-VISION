// Package digest genera un resumen diario de noticias + clima usando Gemini.
// Persistencia: SQLite via store.DB — un resumen por usuario por día.
// Caché en memoria: 4 horas para evitar llamadas repetidas a Gemini.
package digest

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/clima"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/noticias"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/store"
)

// DigestResponse es la respuesta del endpoint /api/digest.
type DigestResponse struct {
	OK        bool   `json:"ok"`
	Text      string `json:"text"`
	City      string `json:"city"`
	TempC     string `json:"temp_c,omitempty"`
	CachedAt  string `json:"cached_at"`
	ExpiresIn int    `json:"expires_in_seconds"`
	FromStore bool   `json:"from_store,omitempty"` // true si viene del histórico SQLite
}

// HistoryEntry es un resumen del histórico de un usuario.
type HistoryEntry struct {
	Date string `json:"date"`
	Text string `json:"text"`
}

type memCache struct {
	resp      DigestResponse
	expiresAt time.Time
}

// Service genera y cachea el resumen diario.
type Service struct {
	geminiKey    string
	noticiassSvc *noticias.Service
	climaSvc     *clima.Service
	store        *store.DB
	mu           sync.Mutex
	cached       *memCache
	cacheTTL     time.Duration
}

func New(geminiKey string, n *noticias.Service, c *clima.Service, db *store.DB) *Service {
	return &Service{
		geminiKey:    strings.TrimSpace(geminiKey),
		noticiassSvc: n,
		climaSvc:     c,
		store:        db,
		cacheTTL:     4 * time.Hour,
	}
}

// userToken extrae el identificador del usuario del query param ?u= o Bearer.
func userToken(r *http.Request) string {
	if u := strings.TrimSpace(r.URL.Query().Get("u")); u != "" {
		return u
	}
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return "_global"
}

// HandleDigest es el handler HTTP para GET /api/digest.
func (s *Service) HandleDigest(w http.ResponseWriter, r *http.Request) {
	user := userToken(r)

	// 1. Caché en memoria (compartida, válida por 4h)
	s.mu.Lock()
	if s.cached != nil && time.Now().Before(s.cached.expiresAt) {
		resp := s.cached.resp
		resp.ExpiresIn = int(time.Until(s.cached.expiresAt).Seconds())
		s.mu.Unlock()
		writeJSON(w, http.StatusOK, resp)
		return
	}
	s.mu.Unlock()

	// 2. Buscar en SQLite: ¿ya hay resumen de hoy para este usuario?
	if s.store != nil {
		if d, err := s.store.GetDigestToday(user); err == nil {
			resp := DigestResponse{
				OK:        true,
				Text:      d.DigestText,
				City:      "La Habana",
				CachedAt:  d.CreatedDate,
				FromStore: true,
				ExpiresIn: int(time.Until(midnight()).Seconds()),
			}
			s.mu.Lock()
			s.cached = &memCache{resp: resp, expiresAt: midnight()}
			s.mu.Unlock()
			writeJSON(w, http.StatusOK, resp)
			return
		}
		// Si el usuario es distinto pero hay un resumen global de hoy, reutilizarlo
		if user != "_global" {
			if d, err := s.store.GetDigestGlobal(); err == nil && d.DigestText != "" {
				resp := DigestResponse{
					OK:        true,
					Text:      d.DigestText,
					City:      "La Habana",
					CachedAt:  d.CreatedDate,
					FromStore: true,
					ExpiresIn: int(time.Until(midnight()).Seconds()),
				}
				// Guardarlo también para este usuario
				_ = s.store.SaveDigest(user, d.DigestText, "")
				s.mu.Lock()
				s.cached = &memCache{resp: resp, expiresAt: midnight()}
				s.mu.Unlock()
				writeJSON(w, http.StatusOK, resp)
				return
			}
		}
	}

	// 3. Generar con Gemini
	resp, err := s.generate()
	if err != nil {
		log.Printf("⚠️ Digest: error generando resumen: %v", err)
		writeJSON(w, http.StatusInternalServerError, DigestResponse{
			OK:   false,
			Text: "No se pudo generar el resumen del día. Inténtalo más tarde.",
		})
		return
	}

	// 4. Persistir en SQLite
	if s.store != nil {
		if err := s.store.SaveDigest(user, resp.Text, ""); err != nil {
			log.Printf("⚠️ Digest: error guardando en store: %v", err)
		}
	}

	// 5. Actualizar caché en memoria hasta medianoche
	exp := midnight()
	if time.Until(exp) > s.cacheTTL {
		exp = time.Now().Add(s.cacheTTL)
	}
	s.mu.Lock()
	s.cached = &memCache{resp: resp, expiresAt: exp}
	s.mu.Unlock()

	resp.ExpiresIn = int(time.Until(exp).Seconds())
	writeJSON(w, http.StatusOK, resp)
}

// HandleDigestHistory devuelve el histórico de resúmenes de un usuario.
// GET /api/digest/history?u=TOKEN&limit=7
func (s *Service) HandleDigestHistory(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "entries": []HistoryEntry{}})
		return
	}
	user := userToken(r)
	limit := 7
	digests, err := s.store.ListDigests(user, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}
	entries := make([]HistoryEntry, 0, len(digests))
	for _, d := range digests {
		entries = append(entries, HistoryEntry{Date: d.CreatedDate, Text: d.DigestText})
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "entries": entries})
}

// midnight devuelve el instante de medianoche del día siguiente (hora local).
func midnight() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
}

func (s *Service) generate() (DigestResponse, error) {
	// Recopilar titulares: hasta 8 entre varias fuentes
	var headlines []string
	for _, key := range []string{"cibercuba", "14ymedio", "bbc_mundo", "dw_es", "xataka"} {
		arts, err := s.noticiassSvc.FetchFeed(key, 2)
		if err != nil {
			continue
		}
		for _, a := range arts {
			title := strings.TrimSpace(a.Title)
			if title != "" {
				headlines = append(headlines, title)
			}
		}
		if len(headlines) >= 8 {
			break
		}
	}

	// Obtener clima de La Habana
	weatherLine := ""
	tempStr := ""
	if wx, err := s.climaSvc.FetchByCity("La Habana"); err == nil {
		tempStr = fmt.Sprintf("%.0f°C", wx.Current.Temperature)
		weatherLine = fmt.Sprintf("Clima en La Habana: %s, humedad %d%%.", tempStr, wx.Current.Humidity)
	}

	if len(headlines) == 0 && weatherLine == "" {
		return DigestResponse{}, fmt.Errorf("no hay datos para generar el resumen")
	}

	newsBlock := strings.Join(headlines, "\n- ")
	if newsBlock != "" {
		newsBlock = "- " + newsBlock
	}
	prompt := fmt.Sprintf(`Eres el narrador del Resumen del Día de RAULI VISION.
Genera un resumen de voz de MÁXIMO 280 caracteres (contando espacios y signos).
Usa un tono natural, cálido y periodístico. Menciona el clima si está disponible.
No uses listas, solo frases seguidas. Sin emojis. Sin comillas. Sin markdown.

%s

Noticias del día:
%s

Responde SOLO con el texto del resumen, nada más.`, weatherLine, newsBlock)

	text, err := s.callGemini(prompt)
	if err != nil {
		log.Printf("⚠️ Digest Gemini no disponible: %v — usando fallback local", err)
		text = s.localFallback(weatherLine, headlines)
	}

	if len([]rune(text)) > 300 {
		runes := []rune(text)
		text = string(runes[:297]) + "..."
	}

	return DigestResponse{
		OK:       true,
		Text:     text,
		City:     "La Habana",
		TempC:    tempStr,
		CachedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *Service) localFallback(weatherLine string, headlines []string) string {
	parts := []string{}
	if weatherLine != "" {
		parts = append(parts, weatherLine)
	}
	if len(headlines) > 0 {
		parts = append(parts, headlines[0]+".")
	}
	if len(headlines) > 1 {
		parts = append(parts, headlines[1]+".")
	}
	result := strings.Join(parts, " ")
	if len([]rune(result)) > 300 {
		runes := []rune(result)
		result = string(runes[:297]) + "..."
	}
	return result
}

func (s *Service) callGemini(prompt string) (string, error) {
	if s.geminiKey == "" {
		return "", fmt.Errorf("GEMINI_API_KEY no configurado")
	}
	reqBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"role": "user", "parts": []map[string]string{{"text": prompt}}},
		},
		"generationConfig": map[string]interface{}{
			"temperature":    0.7,
			"maxOutputTokens": 512,
			"thinkingConfig": map[string]interface{}{"thinkingBudget": 0},
		},
	}
	bodyJSON, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}
	apiURL := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s",
		s.geminiKey,
	)
	httpReq, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyJSON))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 20 * time.Second}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer httpResp.Body.Close()
	if httpResp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gemini status=%d", httpResp.StatusCode)
	}
	var gemResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(httpResp.Body).Decode(&gemResp); err != nil {
		return "", err
	}
	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("gemini: respuesta vacía")
	}
	return strings.TrimSpace(gemResp.Candidates[0].Content.Parts[0].Text), nil
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// Ensure database/sql import is used (via store which uses it internally).
var _ = sql.ErrNoRows
