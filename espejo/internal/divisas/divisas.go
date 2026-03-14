// Package divisas provee tipos de cambio informales para Cuba (USD, EUR, MLC en CUP).
// Fuente 1: elToque TRMI API con JWT (ELTOQUE_TOKEN).
// Fuente 2: scraper HTML de eltoque.com (fallback, sin token).
// Persistencia: SQLite via store.DB — caché de 4h.
// Rotación de User-Agent para evitar bloqueos del scraper.
package divisas

import (
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/mramirezraul71/RAULI-VISION/espejo/internal/store"
)

// Rate es una tasa de cambio con tendencia.
type Rate struct {
	Currency    string  `json:"currency"`
	BuyCUP      float64 `json:"buy_cup"`
	SellCUP     float64 `json:"sell_cup"`
	Trend       string  `json:"trend"`      // "up" | "down" | "stable"
	UpdatedAt   string  `json:"updated_at"`
	AgeMinutes  int     `json:"age_minutes"`
}

// DivisasResponse es la respuesta del endpoint /api/divisas.
type DivisasResponse struct {
	OK        bool   `json:"ok"`
	Rates     []Rate `json:"rates"`
	Source    string `json:"source"`
	CachedAt  string `json:"cached_at"`
	ExpiresIn int    `json:"expires_in_seconds"`
	Message   string `json:"message,omitempty"`
}

// Rotación de User-Agents — simula distintos navegadores en cada petición.
var userAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
	"Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (Android 14; Mobile; rv:123.0) Gecko/123.0 Firefox/123.0",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
}

// Regex para extraer valores del HTML de eltoque (fallback sin token).
// El sitio embebe datos en el HTML como: "USD":{"buy":NNN,"sell":NNN}
var (
	rateRegex = regexp.MustCompile(`"(USD|EUR|MLC)":\{"buy":([0-9.]+),"sell":([0-9.]+)\}`)
)

const (
	cacheTTL      = 4 * time.Hour
	fetchTimeout  = 12 * time.Second
	elToqueAPIURL = "https://tasas.eltoque.com/v1/trmi"
	elToqueWebURL = "https://eltoque.com/tasas-de-cambio-de-moneda-en-cuba"
)

// Service gestiona la obtención y caché de tipos de cambio.
type Service struct {
	client    *http.Client
	token     string    // ELTOQUE_TOKEN — opcional
	store     *store.DB // persistencia SQLite
	mu        sync.Mutex
	memCache  *memCached
	prev      map[string]float64
}

type memCached struct {
	resp      DivisasResponse
	expiresAt time.Time
}

func New(db *store.DB) *Service {
	return &Service{
		client: &http.Client{
			Timeout: fetchTimeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return fmt.Errorf("demasiadas redirecciones")
				}
				return nil
			},
		},
		token: strings.TrimSpace(os.Getenv("ELTOQUE_TOKEN")),
		store: db,
		prev:  make(map[string]float64),
	}
}

// randomUA devuelve un User-Agent aleatorio del pool.
func randomUA() string {
	return userAgents[rand.Intn(len(userAgents))]
}

// HandleDivisas es el handler HTTP para GET /api/divisas.
func (s *Service) HandleDivisas(w http.ResponseWriter, r *http.Request) {
	// 1. Caché en memoria
	s.mu.Lock()
	if s.memCache != nil && time.Now().Before(s.memCache.expiresAt) {
		resp := s.memCache.resp
		resp.ExpiresIn = int(time.Until(s.memCache.expiresAt).Seconds())
		s.mu.Unlock()
		writeJSON(w, http.StatusOK, resp)
		return
	}
	s.mu.Unlock()

	// 2. Intentar fetch fresco
	resp, err := s.fetchWithFallback()
	if err != nil {
		// 3. Si falla, intentar datos del SQLite (aunque sean viejos)
		if storeResp, storeErr := s.fromStore(); storeErr == nil {
			storeResp.Message = "Datos del caché persistente — fuente no disponible"
			storeResp.ExpiresIn = 0
			writeJSON(w, http.StatusOK, storeResp)
			return
		}
		writeJSON(w, http.StatusOK, DivisasResponse{
			OK:      false,
			Source:  "no_disponible",
			Message: "No se pudieron obtener tasas. Configura ELTOQUE_TOKEN para activar el monitor.",
		})
		return
	}

	// 4. Guardar en SQLite para persistencia entre reinicios
	if s.store != nil && len(resp.Rates) > 0 {
		for _, rt := range resp.Rates {
			_ = s.store.UpsertRate(rt.Currency, rt.BuyCUP, rt.SellCUP, resp.Source)
		}
	}

	// 5. Actualizar caché en memoria
	s.mu.Lock()
	s.memCache = &memCached{resp: resp, expiresAt: time.Now().Add(cacheTTL)}
	s.mu.Unlock()

	resp.ExpiresIn = int(cacheTTL.Seconds())
	writeJSON(w, http.StatusOK, resp)
}

// HandleDivisasRefresh fuerza actualización ignorando caché.
func (s *Service) HandleDivisasRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.mu.Lock()
	s.memCache = nil
	s.mu.Unlock()
	s.HandleDivisas(w, r)
}

// fetchWithFallback intenta la API JWT primero, luego el scraper HTML.
func (s *Service) fetchWithFallback() (DivisasResponse, error) {
	// Fuente 1: API elToque con token
	if s.token != "" {
		resp, err := s.fetchAPI()
		if err == nil {
			return resp, nil
		}
	}

	// Fuente 2: Scraper HTML de eltoque.com
	resp, err := s.fetchScraper()
	if err == nil {
		return resp, nil
	}

	return DivisasResponse{}, fmt.Errorf("todas las fuentes fallaron")
}

// fetchAPI usa el endpoint TRMI de elToque con JWT Bearer.
func (s *Service) fetchAPI() (DivisasResponse, error) {
	req, err := http.NewRequest(http.MethodGet, elToqueAPIURL, nil)
	if err != nil {
		return DivisasResponse{}, err
	}
	req.Header.Set("User-Agent", randomUA())
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.token)

	httpResp, err := s.client.Do(req)
	if err != nil {
		return DivisasResponse{}, err
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode == http.StatusUnauthorized {
		return DivisasResponse{}, fmt.Errorf("token inválido")
	}
	if httpResp.StatusCode != http.StatusOK {
		return DivisasResponse{}, fmt.Errorf("elToque API HTTP %d", httpResp.StatusCode)
	}

	body, _ := io.ReadAll(io.LimitReader(httpResp.Body, 32*1024))

	// La API devuelve: {"USD":{"buy":N,"sell":N},"EUR":{...},"MLC":{...}}
	// Toleramos tanto "buy"/"sell" en minúsculas como mayúsculas.
	var raw map[string]struct {
		Buy1  float64 `json:"buy"`
		Sell1 float64 `json:"sell"`
		Buy2  float64 `json:"Buy"`
		Sell2 float64 `json:"Sell"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return DivisasResponse{}, fmt.Errorf("formato API desconocido: %w", err)
	}
	pairs := make(map[string]currencyPair)
	for code, v := range raw {
		buy := v.Buy1
		if buy == 0 {
			buy = v.Buy2
		}
		sell := v.Sell1
		if sell == 0 {
			sell = v.Sell2
		}
		if buy > 0 || sell > 0 {
			pairs[code] = currencyPair{Buy: buy, Sell: sell}
		}
	}
	return s.buildResponse(pairs, "eltoque_api")
}


type currencyPair struct {
	Buy  float64
	Sell float64
}

func (s *Service) buildResponse(rates map[string]currencyPair, source string) (DivisasResponse, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	var result []Rate
	for _, code := range []string{"USD", "EUR", "MLC"} {
		r, ok := rates[code]
		if !ok || (r.Sell == 0 && r.Buy == 0) {
			continue
		}
		result = append(result, Rate{
			Currency:  code,
			BuyCUP:    r.Buy,
			SellCUP:   r.Sell,
			Trend:     s.trend(code, r.Sell),
			UpdatedAt: now,
		})
	}
	s.mu.Lock()
	for _, rt := range result {
		if rt.SellCUP > 0 {
			s.prev[rt.Currency] = rt.SellCUP
		}
	}
	s.mu.Unlock()

	if len(result) == 0 {
		return DivisasResponse{}, fmt.Errorf("sin tasas válidas")
	}
	return DivisasResponse{OK: true, Rates: result, Source: source, CachedAt: now}, nil
}

// fetchScraper raspa el HTML de eltoque.com buscando patrones JSON embebidos.
func (s *Service) fetchScraper() (DivisasResponse, error) {
	req, err := http.NewRequest(http.MethodGet, elToqueWebURL, nil)
	if err != nil {
		return DivisasResponse{}, err
	}
	req.Header.Set("User-Agent", randomUA())
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "es-ES,es;q=0.9")
	req.Header.Set("Referer", "https://eltoque.com/")
	req.Header.Set("Cache-Control", "no-cache")

	httpResp, err := s.client.Do(req)
	if err != nil {
		return DivisasResponse{}, fmt.Errorf("scraper: no disponible: %w", err)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		return DivisasResponse{}, fmt.Errorf("scraper: HTTP %d", httpResp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(httpResp.Body, 512*1024))
	if err != nil {
		return DivisasResponse{}, fmt.Errorf("scraper: lectura: %w", err)
	}

	// Buscar patrones: "USD":{"buy":NNN,"sell":NNN}
	matches := rateRegex.FindAllSubmatch(body, -1)
	if len(matches) == 0 {
		return DivisasResponse{}, fmt.Errorf("scraper: no se encontraron tasas en el HTML")
	}

	parsed := make(map[string]currencyPair)
	for _, m := range matches {
		code := string(m[1])
		var buy, sell float64
		fmt.Sscanf(string(m[2]), "%f", &buy)
		fmt.Sscanf(string(m[3]), "%f", &sell)
		if buy > 0 || sell > 0 {
			parsed[code] = currencyPair{Buy: buy, Sell: sell}
		}
	}

	if len(parsed) == 0 {
		return DivisasResponse{}, fmt.Errorf("scraper: tasas encontradas pero valores = 0")
	}

	return s.buildResponse(parsed, "eltoque_scraper")
}

// fromStore construye una respuesta a partir del SQLite almacenado.
func (s *Service) fromStore() (DivisasResponse, error) {
	if s.store == nil {
		return DivisasResponse{}, fmt.Errorf("store no disponible")
	}
	rates, err := s.store.GetAllRates()
	if err != nil || len(rates) == 0 {
		return DivisasResponse{}, fmt.Errorf("store vacío")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	var result []Rate
	for _, r := range rates {
		age := int(time.Since(r.LastUpdated).Minutes())
		result = append(result, Rate{
			Currency:   r.Currency,
			BuyCUP:    r.BuyPrice,
			SellCUP:   r.SellPrice,
			Trend:     "stable", // no tenemos prev en store
			UpdatedAt: r.LastUpdated.UTC().Format(time.RFC3339),
			AgeMinutes: age,
		})
	}
	return DivisasResponse{
		OK:       true,
		Rates:    result,
		Source:   "store_cache",
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

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

var _ = strings.TrimSpace
