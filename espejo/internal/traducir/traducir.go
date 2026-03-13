// Package traducir provee traducción de texto vía MyMemory API (gratuita, sin clave requerida).
package traducir

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// TranslationResult contiene el resultado de una traducción.
type TranslationResult struct {
	OriginalText   string  `json:"original_text"`
	TranslatedText string  `json:"translated_text"`
	LangPair       string  `json:"lang_pair"`
	MatchQuality   float64 `json:"match_quality"` // 0-100
	Source         string  `json:"source"`         // "mymemory" | "cached"
}

// LangPair describe un par de idiomas soportado.
type LangPair struct {
	Code  string `json:"code"`
	Label string `json:"label"`
}

var supportedPairs = []LangPair{
	{"es|en", "Español → Inglés"},
	{"en|es", "Inglés → Español"},
	{"es|fr", "Español → Francés"},
	{"fr|es", "Francés → Español"},
	{"es|pt", "Español → Portugués"},
	{"pt|es", "Portugués → Español"},
	{"es|de", "Español → Alemán"},
	{"de|es", "Alemán → Español"},
	{"es|it", "Español → Italiano"},
	{"it|es", "Italiano → Español"},
	{"es|ru", "Español → Ruso"},
	{"en|fr", "Inglés → Francés"},
	{"en|pt", "Inglés → Portugués"},
	{"en|de", "Inglés → Alemán"},
}

type cacheEntry struct {
	result    TranslationResult
	expiresAt time.Time
}

// Service gestiona la traducción de texto.
type Service struct {
	client   *http.Client
	email    string // opcional; aumenta el límite diario de MyMemory
	mu       sync.Mutex
	cache    map[string]cacheEntry
	cacheTTL time.Duration
}

// New crea un Service. Lee MYMEMORY_EMAIL del entorno si está disponible.
func New() *Service {
	return &Service{
		client:   &http.Client{Timeout: 10 * time.Second},
		email:    os.Getenv("MYMEMORY_EMAIL"),
		cache:    make(map[string]cacheEntry),
		cacheTTL: time.Hour,
	}
}

// SupportedPairs devuelve los pares de idiomas soportados.
func (s *Service) SupportedPairs() []LangPair {
	return supportedPairs
}

// Translate traduce texto de un idioma a otro.
func (s *Service) Translate(text, langPair string) (TranslationResult, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return TranslationResult{}, fmt.Errorf("texto vacío")
	}

	// Validar par de idiomas
	valid := false
	for _, p := range supportedPairs {
		if p.Code == langPair {
			valid = true
			break
		}
	}
	if !valid {
		return TranslationResult{}, fmt.Errorf("par de idiomas no soportado: %s", langPair)
	}

	// Truncar al límite de MyMemory (500 sin email, 4000 con email)
	maxLen := 500
	if s.email != "" {
		maxLen = 4000
	}
	runes := []rune(text)
	if len(runes) > maxLen {
		text = string(runes[:maxLen]) + "…"
	}

	cacheKey := langPair + "|" + text
	s.mu.Lock()
	if e, ok := s.cache[cacheKey]; ok && time.Now().Before(e.expiresAt) {
		s.mu.Unlock()
		cached := e.result
		cached.Source = "cached"
		return cached, nil
	}
	s.mu.Unlock()

	apiURL := fmt.Sprintf("https://api.mymemory.translated.net/get?q=%s&langpair=%s",
		url.QueryEscape(text), url.QueryEscape(langPair))
	if s.email != "" {
		apiURL += "&de=" + url.QueryEscape(s.email)
	}

	resp, err := s.client.Get(apiURL)
	if err != nil {
		return TranslationResult{}, fmt.Errorf("error conectando con MyMemory: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return TranslationResult{}, fmt.Errorf("MyMemory respondió HTTP %d", resp.StatusCode)
	}

	var raw struct {
		ResponseData struct {
			TranslatedText string  `json:"translatedText"`
			Match          float64 `json:"match"`
		} `json:"responseData"`
		QuotaFinished bool `json:"quotaFinished"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return TranslationResult{}, fmt.Errorf("error decodificando respuesta: %w", err)
	}

	if raw.QuotaFinished {
		return TranslationResult{}, fmt.Errorf("cuota diaria de traducción agotada")
	}

	translated := strings.TrimSpace(raw.ResponseData.TranslatedText)
	if translated == "" || strings.EqualFold(translated, "NO QUERY SPECIFIED") {
		return TranslationResult{}, fmt.Errorf("traducción no disponible para este texto")
	}

	quality := raw.ResponseData.Match * 100
	if quality > 100 {
		quality = 100
	}

	result := TranslationResult{
		OriginalText:   text,
		TranslatedText: translated,
		LangPair:       langPair,
		MatchQuality:   quality,
		Source:         "mymemory",
	}

	s.mu.Lock()
	s.cache[cacheKey] = cacheEntry{result: result, expiresAt: time.Now().Add(s.cacheTTL)}
	s.mu.Unlock()

	return result, nil
}
