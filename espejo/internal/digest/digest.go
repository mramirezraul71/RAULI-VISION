// Package digest genera un resumen diario de noticias + clima usando Gemini.
package digest

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/clima"
	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/noticias"
)

// DigestResponse es la respuesta del endpoint /api/digest.
type DigestResponse struct {
	OK        bool   `json:"ok"`
	Text      string `json:"text"`
	City      string `json:"city"`
	TempC     string `json:"temp_c,omitempty"`
	CachedAt  string `json:"cached_at"`
	ExpiresIn int    `json:"expires_in_seconds"`
}

type cache struct {
	resp      DigestResponse
	expiresAt time.Time
}

// Service genera y cachea el resumen diario.
type Service struct {
	geminiKey   string
	noticiassSvc *noticias.Service
	climaSvc    *clima.Service
	mu          sync.Mutex
	cached      *cache
	cacheTTL    time.Duration
}

func New(geminiKey string, n *noticias.Service, c *clima.Service) *Service {
	return &Service{
		geminiKey:    strings.TrimSpace(geminiKey),
		noticiassSvc: n,
		climaSvc:     c,
		cacheTTL:     4 * time.Hour,
	}
}

// HandleDigest es el handler HTTP para GET /api/digest.
func (s *Service) HandleDigest(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	if s.cached != nil && time.Now().Before(s.cached.expiresAt) {
		resp := s.cached.resp
		resp.ExpiresIn = int(time.Until(s.cached.expiresAt).Seconds())
		s.mu.Unlock()
		writeJSON(w, http.StatusOK, resp)
		return
	}
	s.mu.Unlock()

	resp, err := s.generate()
	if err != nil {
		log.Printf("⚠️ Digest: error generando resumen: %v", err)
		writeJSON(w, http.StatusInternalServerError, DigestResponse{
			OK:   false,
			Text: "No se pudo generar el resumen del día. Inténtalo más tarde.",
		})
		return
	}

	s.mu.Lock()
	s.cached = &cache{resp: resp, expiresAt: time.Now().Add(s.cacheTTL)}
	s.mu.Unlock()

	resp.ExpiresIn = int(s.cacheTTL.Seconds())
	writeJSON(w, http.StatusOK, resp)
}

func (s *Service) generate() (DigestResponse, error) {
	// Recopilar titulares: 3 de cuba + 3 internacional
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
			if len(headlines) >= 8 {
				break
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

	// Construir prompt para Gemini
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
		// Fallback local: construir resumen básico
		log.Printf("⚠️ Digest Gemini no disponible: %v — usando fallback local", err)
		text = s.localFallback(weatherLine, headlines)
	}

	// Truncar a 300 caracteres por seguridad
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
		parts = append(parts, "Titulares: "+headlines[0]+".")
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
			"temperature":     0.7,
			"maxOutputTokens": 512,
			"thinkingConfig":  map[string]interface{}{"thinkingBudget": 0},
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
