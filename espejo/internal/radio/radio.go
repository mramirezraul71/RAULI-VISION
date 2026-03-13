// Package radio provee estaciones de radio online vía Radio Browser API (gratuita, sin clave).
package radio

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Station representa una estación de radio.
type Station struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Country     string `json:"country"`
	CountryCode string `json:"country_code"`
	Language    string `json:"language"`
	Tags        string `json:"tags"`
	Codec       string `json:"codec"`
	Bitrate     int    `json:"bitrate"`
	StreamURL   string `json:"stream_url"`
	Favicon     string `json:"favicon,omitempty"`
	Votes       int    `json:"votes"`
	Clickcount  int    `json:"clickcount"`
}

type listCache struct {
	stations  []Station
	expiresAt time.Time
}

// Service gestiona la obtención y caché de estaciones de radio.
type Service struct {
	client   *http.Client
	mu       sync.RWMutex
	cache    map[string]listCache
	cacheTTL time.Duration
}

// Radio Browser API — servicio DNS round-robin, sin API key requerida.
const radioBrowserBase = "https://de1.api.radio-browser.info/json"

// New crea un Service con TTL de 30 minutos.
func New() *Service {
	return &Service{
		client:   &http.Client{Timeout: 10 * time.Second},
		cache:    make(map[string]listCache),
		cacheTTL: 30 * time.Minute,
	}
}

// Popular devuelve las estaciones más votadas, opcionalmente filtradas por país.
func (s *Service) Popular(limit int, countryCode string) ([]Station, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	key := fmt.Sprintf("popular_%s_%d", countryCode, limit)
	if cached, ok := s.getCache(key); ok {
		return cached, nil
	}

	u := fmt.Sprintf("%s/stations/topvote/%d?hidebroken=true&order=votes", radioBrowserBase, limit)
	if countryCode != "" {
		u += "&countrycode=" + url.QueryEscape(strings.ToUpper(countryCode))
	}

	stations, err := s.fetchStations(u)
	if err != nil {
		return nil, err
	}
	s.setCache(key, stations)
	return stations, nil
}

// Search busca estaciones por nombre.
func (s *Service) Search(q string, limit int) ([]Station, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	key := fmt.Sprintf("search_%s_%d", q, limit)
	if cached, ok := s.getCache(key); ok {
		return cached, nil
	}

	u := fmt.Sprintf("%s/stations/search?name=%s&limit=%d&hidebroken=true&order=votes",
		radioBrowserBase, url.QueryEscape(q), limit)

	stations, err := s.fetchStations(u)
	if err != nil {
		return nil, err
	}
	s.setCache(key, stations)
	return stations, nil
}

// ByCountry devuelve estaciones de un país específico (código ISO 2 letras).
func (s *Service) ByCountry(countryCode string, limit int) ([]Station, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	key := fmt.Sprintf("country_%s_%d", countryCode, limit)
	if cached, ok := s.getCache(key); ok {
		return cached, nil
	}

	u := fmt.Sprintf("%s/stations/bycountrycodeexact/%s?limit=%d&hidebroken=true&order=votes",
		radioBrowserBase, url.QueryEscape(strings.ToUpper(countryCode)), limit)

	stations, err := s.fetchStations(u)
	if err != nil {
		return nil, err
	}
	s.setCache(key, stations)
	return stations, nil
}

func (s *Service) getCache(key string) ([]Station, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if c, ok := s.cache[key]; ok && time.Now().Before(c.expiresAt) {
		return c.stations, true
	}
	return nil, false
}

func (s *Service) setCache(key string, stations []Station) {
	s.mu.Lock()
	s.cache[key] = listCache{stations: stations, expiresAt: time.Now().Add(s.cacheTTL)}
	s.mu.Unlock()
}

func (s *Service) fetchStations(apiURL string) ([]Station, error) {
	req, _ := http.NewRequest(http.MethodGet, apiURL, nil)
	req.Header.Set("User-Agent", "RauliVision/1.0 (+https://vision.rauliatlasapp.com)")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error conectando con Radio Browser: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Radio Browser respondió HTTP %d", resp.StatusCode)
	}

	var raw []struct {
		UUID        string `json:"stationuuid"`
		Name        string `json:"name"`
		Country     string `json:"country"`
		CountryCode string `json:"countrycode"`
		Language    string `json:"language"`
		Tags        string `json:"tags"`
		Codec       string `json:"codec"`
		Bitrate     int    `json:"bitrate"`
		URLResolved string `json:"url_resolved"`
		URL         string `json:"url"`
		Favicon     string `json:"favicon"`
		Votes       int    `json:"votes"`
		Clickcount  int    `json:"clickcount"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("error decodificando respuesta: %w", err)
	}

	stations := make([]Station, 0, len(raw))
	for _, r := range raw {
		streamURL := r.URLResolved
		if streamURL == "" {
			streamURL = r.URL
		}
		if streamURL == "" {
			continue
		}
		stations = append(stations, Station{
			ID:          r.UUID,
			Name:        r.Name,
			Country:     r.Country,
			CountryCode: r.CountryCode,
			Language:    r.Language,
			Tags:        r.Tags,
			Codec:       r.Codec,
			Bitrate:     r.Bitrate,
			StreamURL:   streamURL,
			Favicon:     r.Favicon,
			Votes:       r.Votes,
			Clickcount:  r.Clickcount,
		})
	}
	return stations, nil
}
