// Package youtube provee búsqueda y extracción de streams de YouTube
// via Invidious (API pública, sin clave) y Cobalt (extractor universal).
package youtube

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// VideoResult es el resultado de una búsqueda en YouTube.
type VideoResult struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Author       string `json:"author"`
	DurationSec  int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	ViewCount    int64  `json:"view_count,omitempty"`
	Published    string `json:"published,omitempty"`
}

// StreamInfo contiene la URL del stream de un video.
type StreamInfo struct {
	ID        string `json:"id"`
	StreamURL string `json:"stream_url"`
	Source    string `json:"source"` // "cobalt" | "invidious"
}

type cacheEntry struct {
	value     interface{}
	expiresAt time.Time
}

// Service gestiona la búsqueda y extracción de videos de YouTube.
type Service struct {
	client    *http.Client
	instances []string // instancias públicas de Invidious
	mu        sync.Mutex
	cache     map[string]cacheEntry
	cacheTTL  time.Duration
}

// Instancias públicas de Invidious — sin registro ni clave requerida.
var defaultInstances = []string{
	"https://inv.riverside.rocks",
	"https://invidious.privacyredirect.com",
	"https://yewtu.be",
	"https://invidious.nerdvpn.de",
}

// New crea un Service con TTL de 15 minutos.
func New() *Service {
	return &Service{
		client: &http.Client{
			Timeout: 15 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("demasiadas redirecciones")
				}
				return nil
			},
		},
		instances: defaultInstances,
		cache:     make(map[string]cacheEntry),
		cacheTTL:  15 * time.Minute,
	}
}

// Search busca videos en YouTube vía Invidious con fallback entre instancias.
func (s *Service) Search(q string, max int) ([]VideoResult, error) {
	if max <= 0 || max > 20 {
		max = 15
	}
	cacheKey := fmt.Sprintf("search_%s_%d", q, max)

	s.mu.Lock()
	if e, ok := s.cache[cacheKey]; ok && time.Now().Before(e.expiresAt) {
		s.mu.Unlock()
		if results, ok := e.value.([]VideoResult); ok {
			return results, nil
		}
	}
	s.mu.Unlock()

	var lastErr error
	for _, instance := range s.instances {
		results, err := s.searchOnInstance(instance, q, max)
		if err != nil {
			lastErr = err
			continue
		}
		s.mu.Lock()
		s.cache[cacheKey] = cacheEntry{value: results, expiresAt: time.Now().Add(s.cacheTTL)}
		s.mu.Unlock()
		return results, nil
	}
	return nil, fmt.Errorf("todas las instancias de búsqueda fallaron: %v", lastErr)
}

func (s *Service) searchOnInstance(instance, q string, max int) ([]VideoResult, error) {
	u := fmt.Sprintf(
		"%s/api/v1/search?q=%s&type=video&fields=videoId,title,author,lengthSeconds,viewCount,publishedText,videoThumbnails",
		instance, url.QueryEscape(q),
	)
	resp, err := s.client.Get(u)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("instancia %s respondió HTTP %d", instance, resp.StatusCode)
	}

	var raw []struct {
		VideoID   string `json:"videoId"`
		Title     string `json:"title"`
		Author    string `json:"author"`
		LengthSec int    `json:"lengthSeconds"`
		ViewCount int64  `json:"viewCount"`
		Published string `json:"publishedText"`
		Thumbs    []struct {
			URL    string `json:"url"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"videoThumbnails"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	results := make([]VideoResult, 0, len(raw))
	for _, v := range raw {
		if v.VideoID == "" {
			continue
		}
		thumb := ""
		// Buscar thumbnail ~320px de ancho
		for _, t := range v.Thumbs {
			if t.Width >= 200 && t.Width <= 480 && t.URL != "" {
				thumb = t.URL
				break
			}
		}
		if thumb == "" && len(v.Thumbs) > 0 {
			thumb = v.Thumbs[0].URL
		}
		// Asegurar URL absoluta
		if strings.HasPrefix(thumb, "//") {
			thumb = "https:" + thumb
		}
		results = append(results, VideoResult{
			ID:           v.VideoID,
			Title:        v.Title,
			Author:       v.Author,
			DurationSec:  v.LengthSec,
			ThumbnailURL: thumb,
			ViewCount:    v.ViewCount,
			Published:    v.Published,
		})
		if len(results) >= max {
			break
		}
	}
	return results, nil
}

// FetchStream obtiene la URL del stream de un video. Intenta Cobalt primero,
// luego Invidious como fallback.
func (s *Service) FetchStream(videoID string) (StreamInfo, error) {
	cacheKey := "stream_" + videoID
	s.mu.Lock()
	if e, ok := s.cache[cacheKey]; ok && time.Now().Before(e.expiresAt) {
		s.mu.Unlock()
		if si, ok := e.value.(StreamInfo); ok {
			return si, nil
		}
	}
	s.mu.Unlock()

	// Intentar Cobalt primero
	if si, err := s.fetchViaCobalt(videoID); err == nil {
		s.mu.Lock()
		s.cache[cacheKey] = cacheEntry{value: si, expiresAt: time.Now().Add(s.cacheTTL)}
		s.mu.Unlock()
		return si, nil
	}

	// Fallback: Invidious
	for _, instance := range s.instances {
		if si, err := s.fetchViaInvidious(instance, videoID); err == nil {
			s.mu.Lock()
			s.cache[cacheKey] = cacheEntry{value: si, expiresAt: time.Now().Add(s.cacheTTL)}
			s.mu.Unlock()
			return si, nil
		}
	}
	return StreamInfo{}, fmt.Errorf("no se pudo obtener stream para video %s", videoID)
}

func (s *Service) fetchViaCobalt(videoID string) (StreamInfo, error) {
	body := fmt.Sprintf(`{"url":"https://www.youtube.com/watch?v=%s","isAudioOnly":false,"vQuality":"360"}`, videoID)
	req, _ := http.NewRequest(http.MethodPost, "https://api.cobalt.tools/", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return StreamInfo{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return StreamInfo{}, fmt.Errorf("cobalt HTTP %d", resp.StatusCode)
	}

	var raw struct {
		Status string `json:"status"`
		URL    string `json:"url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return StreamInfo{}, err
	}
	if raw.URL == "" || raw.Status == "error" {
		return StreamInfo{}, fmt.Errorf("cobalt: no stream URL")
	}
	return StreamInfo{ID: videoID, StreamURL: raw.URL, Source: "cobalt"}, nil
}

func (s *Service) fetchViaInvidious(instance, videoID string) (StreamInfo, error) {
	u := fmt.Sprintf("%s/api/v1/videos/%s?fields=adaptiveFormats,formatStreams", instance, videoID)
	resp, err := s.client.Get(u)
	if err != nil {
		return StreamInfo{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return StreamInfo{}, fmt.Errorf("invidious HTTP %d", resp.StatusCode)
	}

	var raw struct {
		FormatStreams []struct {
			URL     string `json:"url"`
			Type    string `json:"type"`
			Quality string `json:"quality"` // "medium", "small", "tiny"
		} `json:"formatStreams"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return StreamInfo{}, err
	}

	// Preferir calidad baja (ahorra ancho de banda)
	for _, q := range []string{"small", "medium", "tiny"} {
		for _, f := range raw.FormatStreams {
			if strings.Contains(f.Type, "video/mp4") && f.Quality == q && f.URL != "" {
				streamURL := f.URL
				if strings.HasPrefix(streamURL, "/") {
					streamURL = instance + streamURL
				}
				return StreamInfo{ID: videoID, StreamURL: streamURL, Source: "invidious"}, nil
			}
		}
	}
	// Fallback: cualquier MP4
	for _, f := range raw.FormatStreams {
		if strings.Contains(f.Type, "video/mp4") && f.URL != "" {
			return StreamInfo{ID: videoID, StreamURL: f.URL, Source: "invidious"}, nil
		}
	}
	return StreamInfo{}, fmt.Errorf("no se encontró formato MP4 para %s en %s", videoID, instance)
}

// ProxyStream hace proxy de un stream al cliente (sin almacenamiento local).
func (s *Service) ProxyStream(w http.ResponseWriter, streamURL string) {
	req, err := http.NewRequest(http.MethodGet, streamURL, nil)
	if err != nil {
		http.Error(w, "URL inválida", http.StatusBadRequest)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; RauliVision/1.0)")

	resp, err := s.client.Do(req)
	if err != nil {
		http.Error(w, "error conectando al stream", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for _, h := range []string{"Content-Type", "Content-Length", "Accept-Ranges"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint: errcheck
}
