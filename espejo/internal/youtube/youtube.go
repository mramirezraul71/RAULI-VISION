// Package youtube provee búsqueda y extracción de streams de YouTube
// via YouTube InnerTube API (sin clave requerida — es la misma API que usa youtube.com).
package youtube

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	Source    string `json:"source"` // "innertube" | "embed"
}

type cacheEntry struct {
	value     interface{}
	expiresAt time.Time
}

// Service gestiona la búsqueda y extracción de videos de YouTube.
type Service struct {
	client   *http.Client
	mu       sync.Mutex
	cache    map[string]cacheEntry
	cacheTTL time.Duration
}

// innerTubeKey es la clave pública del cliente web de YouTube (hardcoded en youtube.com).
const innerTubeKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"

// innerTubeCtxSearch es el contexto de cliente WEB para búsquedas.
const innerTubeCtxSearch = `{"client":{"clientName":"WEB","clientVersion":"2.20240101.00.00","hl":"es","gl":"US"}}`

// innerTubeCtxPlayer es el contexto de cliente ANDROID — proporciona stream URLs sin cifrado.
const innerTubeCtxPlayer = `{"client":{"clientName":"ANDROID","clientVersion":"19.09.37","androidSdkVersion":30,"hl":"es","gl":"US"}}`

// innerTubeKeyAndroid es la clave pública del cliente Android de YouTube.
const innerTubeKeyAndroid = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w"

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
		cache:    make(map[string]cacheEntry),
		cacheTTL: 15 * time.Minute,
	}
}

// Search busca videos en YouTube vía InnerTube API (sin clave de usuario).
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

	results, err := s.searchInnerTube(q, max)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.cache[cacheKey] = cacheEntry{value: results, expiresAt: time.Now().Add(s.cacheTTL)}
	s.mu.Unlock()
	return results, nil
}

func (s *Service) searchInnerTube(q string, max int) ([]VideoResult, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"context": json.RawMessage(innerTubeCtxSearch),
		"query":   q,
		"params":  "EgIQAQ%3D%3D", // filter: videos only
	})
	apiURL := "https://www.youtube.com/youtubei/v1/search?key=" + innerTubeKey
	req, err := http.NewRequest(http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("X-YouTube-Client-Name", "1")
	req.Header.Set("X-YouTube-Client-Version", "2.20240101.00.00")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("InnerTube search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("InnerTube search respondió HTTP %d", resp.StatusCode)
	}

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	results := make([]VideoResult, 0, max)
	extractVideos(&raw, &results, max)
	if len(results) == 0 {
		return nil, fmt.Errorf("InnerTube: no se encontraron videos para %q", q)
	}
	return results, nil
}

// extractVideos recorre recursivamente el JSON de InnerTube buscando videoRenderer.
func extractVideos(node *map[string]json.RawMessage, results *[]VideoResult, max int) {
	if len(*results) >= max {
		return
	}
	for key, val := range *node {
		if key == "videoRenderer" {
			var vr map[string]json.RawMessage
			if json.Unmarshal(val, &vr) == nil {
				if r, ok := parseVideoRenderer(vr); ok {
					*results = append(*results, r)
					if len(*results) >= max {
						return
					}
				}
			}
			continue
		}
		// Intentar como objeto
		var obj map[string]json.RawMessage
		if json.Unmarshal(val, &obj) == nil {
			extractVideos(&obj, results, max)
			if len(*results) >= max {
				return
			}
			continue
		}
		// Intentar como array
		var arr []json.RawMessage
		if json.Unmarshal(val, &arr) == nil {
			for _, item := range arr {
				var obj2 map[string]json.RawMessage
				if json.Unmarshal(item, &obj2) == nil {
					extractVideos(&obj2, results, max)
					if len(*results) >= max {
						return
					}
				}
			}
		}
	}
}

func parseVideoRenderer(vr map[string]json.RawMessage) (VideoResult, bool) {
	var videoID string
	if v, ok := vr["videoId"]; ok {
		json.Unmarshal(v, &videoID)
	}
	if videoID == "" {
		return VideoResult{}, false
	}

	// Title
	title := extractRunsText(vr["title"])
	// Author / channel
	author := extractRunsText(vr["ownerText"])
	if author == "" {
		author = extractRunsText(vr["shortBylineText"])
	}
	// Duration string → seconds
	durationStr := extractSimpleText(vr["lengthText"])
	durationSec := parseDuration(durationStr)
	// Published
	published := extractSimpleText(vr["publishedTimeText"])
	// ViewCount
	viewCountStr := extractSimpleText(vr["viewCountText"])
	viewCount := parseViewCount(viewCountStr)
	// Thumbnail
	thumb := fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", videoID)

	return VideoResult{
		ID:           videoID,
		Title:        title,
		Author:       author,
		DurationSec:  durationSec,
		ThumbnailURL: thumb,
		ViewCount:    viewCount,
		Published:    published,
	}, true
}

func extractRunsText(raw json.RawMessage) string {
	if raw == nil {
		return ""
	}
	var obj struct {
		Runs []struct {
			Text string `json:"text"`
		} `json:"runs"`
	}
	if json.Unmarshal(raw, &obj) == nil && len(obj.Runs) > 0 {
		return obj.Runs[0].Text
	}
	return ""
}

func extractSimpleText(raw json.RawMessage) string {
	if raw == nil {
		return ""
	}
	var obj struct {
		SimpleText string `json:"simpleText"`
	}
	if json.Unmarshal(raw, &obj) == nil {
		return obj.SimpleText
	}
	// Fallback: runs
	return extractRunsText(raw)
}

func parseDuration(s string) int {
	// Formato "H:MM:SS" o "M:SS"
	parts := strings.Split(s, ":")
	total := 0
	for _, p := range parts {
		n := 0
		for _, c := range p {
			if c >= '0' && c <= '9' {
				n = n*10 + int(c-'0')
			}
		}
		total = total*60 + n
	}
	return total
}

func parseViewCount(s string) int64 {
	// "1,234,567 views" → 1234567 (aproximado)
	var n int64
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int64(c-'0')
		} else if c == ',' || c == '.' {
			continue
		} else if n > 0 {
			break
		}
	}
	return n
}

// FetchStream obtiene la URL del stream de un video vía InnerTube player API.
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

	si, err := s.fetchViaInnerTubePlayer(videoID)
	if err != nil {
		return StreamInfo{}, err
	}
	s.mu.Lock()
	s.cache[cacheKey] = cacheEntry{value: si, expiresAt: time.Now().Add(5 * time.Minute)}
	s.mu.Unlock()
	return si, nil
}

func (s *Service) fetchViaInnerTubePlayer(videoID string) (StreamInfo, error) {
	// YouTube bloquea extracción server-side con todos los clientes InnerTube conocidos.
	// Devolver embed URL para que el frontend pueda mostrar el video en un iframe.
	embedURL := fmt.Sprintf("https://www.youtube.com/embed/%s?autoplay=1&rel=0", videoID)
	return StreamInfo{ID: videoID, StreamURL: embedURL, Source: "embed"}, nil
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
