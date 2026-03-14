// Package divisas provee tipos de cambio informales para Cuba (USD, EUR, MLC en CUP).
// Fuente: elToque TRMI API — requiere token JWT (variable ELTOQUE_TOKEN).
// Sin token: el widget muestra "sin datos" graciosamente.
// Registro gratuito en: https://eltoque.com para obtener token.
package divisas

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Rate es una tasa de cambio con tendencia.
type Rate struct {
	Currency  string  `json:"currency"`
	BuyCUP    float64 `json:"buy_cup"`
	SellCUP   float64 `json:"sell_cup"`
	Trend     string  `json:"trend"`   // "up" | "down" | "stable"
	UpdatedAt string  `json:"updated_at"`
}

// DivisasResponse es la respuesta del endpoint /api/divisas.
type DivisasResponse struct {
	OK        bool   `json:"ok"`
	Rates     []Rate `json:"rates"`
	Source    string `json:"source"`
	CachedAt  string `json:"cached_at"`
	ExpiresIn int    `json:"expires_in_seconds"`
}

type cached struct {
	resp      DivisasResponse
	expiresAt time.Time
}

// Service gestiona la obtención y caché de tipos de cambio.
type Service struct {
	client   *http.Client
	token    string // ELTOQUE_TOKEN — opcional
	mu       sync.Mutex
	cache    *cached
	cacheTTL time.Duration
	prev     map[string]float64 // para calcular tendencia
}

func New() *Service {
	return &Service{
		client:   &http.Client{Timeout: 10 * time.Second},
		token:    strings.TrimSpace(os.Getenv("ELTOQUE_TOKEN")),
		cacheTTL: 4 * time.Hour,
		prev:     make(map[string]float64),
	}
}

// HandleDivisas es el handler HTTP para GET /api/divisas.
func (s *Service) HandleDivisas(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	if s.cache != nil && time.Now().Before(s.cache.expiresAt) {
		resp := s.cache.resp
		resp.ExpiresIn = int(time.Until(s.cache.expiresAt).Seconds())
		s.mu.Unlock()
		writeJSON(w, http.StatusOK, resp)
		return
	}
	s.mu.Unlock()

	resp, err := s.fetch()
	if err != nil {
		// Sin token o token inválido → devolver respuesta degradada (no es error de servidor)
		if resp.Source == "sin_token" || resp.Source == "token_invalido" {
			resp.ExpiresIn = 300 // reintentar en 5 min
			writeJSON(w, http.StatusOK, resp)
			return
		}
		// Error de red → intentar caché vencido
		s.mu.Lock()
		if s.cache != nil {
			old := s.cache.resp
			old.ExpiresIn = 0
			s.mu.Unlock()
			writeJSON(w, http.StatusOK, old)
			return
		}
		s.mu.Unlock()
		writeJSON(w, http.StatusServiceUnavailable, DivisasResponse{
			OK: false, Source: "error",
		})
		return
	}

	s.mu.Lock()
	s.cache = &cached{resp: resp, expiresAt: time.Now().Add(s.cacheTTL)}
	s.mu.Unlock()

	resp.ExpiresIn = int(s.cacheTTL.Seconds())
	writeJSON(w, http.StatusOK, resp)
}

// elToque TRMI API — requiere JWT en ELTOQUE_TOKEN
// Registro gratuito: https://eltoque.com
func (s *Service) fetch() (DivisasResponse, error) {
	if s.token == "" {
		return DivisasResponse{
			OK:       false,
			Source:   "sin_token",
			CachedAt: time.Now().UTC().Format(time.RFC3339),
		}, fmt.Errorf("ELTOQUE_TOKEN no configurado")
	}

	apiURL := "https://tasas.eltoque.com/v1/trmi"
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return DivisasResponse{}, err
	}
	req.Header.Set("User-Agent", "RauliVision/1.0 (+https://vision.rauliatlasapp.com)")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.token)

	resp, err := s.client.Do(req)
	if err != nil {
		return DivisasResponse{}, fmt.Errorf("elToque no disponible: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return DivisasResponse{
			OK:       false,
			Source:   "token_invalido",
			CachedAt: time.Now().UTC().Format(time.RFC3339),
		}, fmt.Errorf("ELTOQUE_TOKEN inválido o expirado")
	}
	if resp.StatusCode != http.StatusOK {
		return DivisasResponse{}, fmt.Errorf("elToque HTTP %d", resp.StatusCode)
	}

	// Estructura de respuesta de elToque TRMI
	var raw struct {
		USD struct {
			Buy  float64 `json:"buy"`
			Sell float64 `json:"sell"`
		} `json:"USD"`
		EUR struct {
			Buy  float64 `json:"buy"`
			Sell float64 `json:"sell"`
		} `json:"EUR"`
		MLC struct {
			Buy  float64 `json:"buy"`
			Sell float64 `json:"sell"`
		} `json:"MLC"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return DivisasResponse{}, fmt.Errorf("error parseando respuesta: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)

	rates := []Rate{
		{Currency: "USD", BuyCUP: raw.USD.Buy, SellCUP: raw.USD.Sell, Trend: s.trend("USD", raw.USD.Sell), UpdatedAt: now},
		{Currency: "EUR", BuyCUP: raw.EUR.Buy, SellCUP: raw.EUR.Sell, Trend: s.trend("EUR", raw.EUR.Sell), UpdatedAt: now},
		{Currency: "MLC", BuyCUP: raw.MLC.Buy, SellCUP: raw.MLC.Sell, Trend: s.trend("MLC", raw.MLC.Sell), UpdatedAt: now},
	}

	// Actualizar precios previos para la próxima comparación
	s.mu.Lock()
	for _, rt := range rates {
		if rt.SellCUP > 0 {
			s.prev[rt.Currency] = rt.SellCUP
		}
	}
	s.mu.Unlock()

	return DivisasResponse{
		OK:       true,
		Rates:    rates,
		Source:   "elToque",
		CachedAt: now,
	}, nil
}

func (s *Service) trend(currency string, current float64) string {
	prev, ok := s.prev[currency]
	if !ok || prev == 0 || current == 0 {
		return "stable"
	}
	diff := current - prev
	if diff > 0.5 {
		return "up"
	}
	if diff < -0.5 {
		return "down"
	}
	return "stable"
}

// HandleDivisasRefresh fuerza una actualización ignorando el caché.
func (s *Service) HandleDivisasRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.mu.Lock()
	s.cache = nil
	s.mu.Unlock()
	s.HandleDivisas(w, r)
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// FormatWidget devuelve una representación compacta para el widget del header.
func (r Rate) FormatWidget() string {
	arrow := ""
	switch r.Trend {
	case "up":
		arrow = "↑"
	case "down":
		arrow = "↓"
	default:
		arrow = "→"
	}
	return fmt.Sprintf("%s %.0f%s", r.Currency, r.SellCUP, arrow)
}

var _ = strings.TrimSpace // mantener import
