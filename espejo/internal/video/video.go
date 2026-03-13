package video

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type VideoMeta struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Channel     string   `json:"channel"`
	DurationSec int      `json:"duration_sec"`
	Qualities   []string `json:"qualities"`
	Ready       bool     `json:"ready"`
	Live        bool     `json:"live"`
	Description string   `json:"description,omitempty"`
	WatchURL    string   `json:"watch_url,omitempty"`
	CubaURL     string   `json:"cuba_url,omitempty"`
	HLSProxyURL string   `json:"hls_proxy_url,omitempty"` // Proxy HLS endpoint para player embebido
	HasHLS      bool     `json:"has_hls"`                  // true si tiene stream m3u8 directo
}

type SearchItem struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Channel      string `json:"channel"`
	DurationSec  int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	Description  string `json:"description,omitempty"`
	Category     string `json:"category,omitempty"`
	WatchURL     string `json:"watch_url,omitempty"`
	CubaReady    bool   `json:"cuba_ready"`
}

type JobStatus struct {
	JobID           string  `json:"job_id"`
	Status          string  `json:"status"`
	ProgressPercent int     `json:"progress_percent"`
	Error           *string `json:"error,omitempty"`
}

type ChannelHealth struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Channel    string `json:"channel"`
	URL        string `json:"url"`
	CubaMode   bool   `json:"cuba_mode"`
	CubaReady  bool   `json:"cuba_ready"`
	Reachable  bool   `json:"reachable"`
	StatusCode int    `json:"status_code"`
	LatencyMS  int64  `json:"latency_ms"`
	Error      string `json:"error,omitempty"`
	CheckedAt  string `json:"checked_at"`
}

type channel struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Channel     string   `json:"channel"`
	Category    string   `json:"category,omitempty"`
	Description string   `json:"description,omitempty"`
	URL         string   `json:"url"`
	FallbackURL string   `json:"fallback_url,omitempty"`
	StreamM3U8  string   `json:"stream_m3u8,omitempty"` // URL directa m3u8/HLS
	LogoURL     string   `json:"logo_url,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	CubaReady   bool     `json:"cuba_ready"`
	Priority    int      `json:"priority"`
}

type cachedHealth struct {
	expiresAt time.Time
	value     ChannelHealth
}

type Service struct {
	mu          sync.RWMutex
	jobs        map[string]string
	ready       map[string]bool
	channels    []channel
	byID        map[string]channel
	client      *http.Client
	healthTTL   time.Duration
	healthCache map[string]cachedHealth
}

func New() *Service {
	channels := loadChannels()
	timeoutSec := readIntEnv("TV_HEALTHCHECK_TIMEOUT_SEC", 8, 2, 20)
	ttlSec := readIntEnv("TV_HEALTHCHECK_TTL_SEC", 300, 15, 3600)

	byID := make(map[string]channel, len(channels))
	ready := make(map[string]bool, len(channels))
	for _, ch := range channels {
		byID[ch.ID] = ch
		ready[ch.ID] = true
	}

	return &Service{
		jobs:        make(map[string]string),
		ready:       ready,
		channels:    channels,
		byID:        byID,
		client:      &http.Client{Timeout: time.Duration(timeoutSec) * time.Second},
		healthTTL:   time.Duration(ttlSec) * time.Second,
		healthCache: make(map[string]cachedHealth),
	}
}

func (s *Service) Search(q string, max int) ([]SearchItem, error) {
	if max <= 0 {
		max = 15
	}
	if max > 50 {
		max = 50
	}
	query := normalize(q)

	candidates := s.sortedChannels()
	items := make([]SearchItem, 0, max)
	for _, ch := range candidates {
		if query != "" && !matchesChannel(ch, query) {
			continue
		}
		items = append(items, SearchItem{
			ID:           ch.ID,
			Title:        ch.Title,
			Channel:      ch.Channel,
			DurationSec:  0,
			ThumbnailURL: ch.LogoURL,
			Description:  ch.Description,
			Category:     ch.Category,
			WatchURL:     "/api/video/" + url.PathEscape(ch.ID) + "/stream?mode=cuba",
			CubaReady:    ch.CubaReady,
		})
		if len(items) >= max {
			break
		}
	}
	return items, nil
}

func (s *Service) Meta(id string) (VideoMeta, bool) {
	ch, ok := s.getChannel(id)
	if !ok {
		return VideoMeta{}, false
	}
	meta := VideoMeta{
		ID:          ch.ID,
		Title:       ch.Title,
		Channel:     ch.Channel,
		DurationSec: 0,
		Qualities:   []string{"auto", "360p", "480p"},
		Ready:       true,
		Live:        true,
		Description: ch.Description,
		WatchURL:    "/api/video/" + url.PathEscape(ch.ID) + "/stream",
		CubaURL:     "/api/video/" + url.PathEscape(ch.ID) + "/stream?mode=cuba",
	}
	if ch.StreamM3U8 != "" {
		meta.HLSProxyURL = "/api/video/hls?url=" + url.QueryEscape(ch.StreamM3U8)
		meta.HasHLS = true
	}
	return meta, true
}

func (s *Service) Request(id, quality string) (jobID string, status string, err error) {
	_ = quality
	if _, ok := s.getChannel(id); !ok {
		return "", "", errors.New("canal no encontrado")
	}
	jobID = uuid.New().String()
	s.mu.Lock()
	s.jobs[jobID] = id
	s.ready[id] = true
	s.mu.Unlock()
	go s.simulateJob(jobID)
	return jobID, "ready", nil
}

func (s *Service) simulateJob(jobID string) {
	time.Sleep(350 * time.Millisecond)
	s.mu.Lock()
	delete(s.jobs, jobID)
	s.mu.Unlock()
}

func (s *Service) Status(jobID, videoID string) (JobStatus, bool) {
	s.mu.RLock()
	id, exists := s.jobs[jobID]
	ready := s.ready[videoID]
	s.mu.RUnlock()
	if !exists && ready {
		return JobStatus{JobID: jobID, Status: "ready", ProgressPercent: 100}, true
	}
	if !exists {
		return JobStatus{JobID: jobID, Status: "pending", ProgressPercent: 0}, true
	}
	if id != videoID {
		return JobStatus{}, false
	}
	return JobStatus{JobID: jobID, Status: "processing", ProgressPercent: 80}, true
}

func (s *Service) StreamURL(id string, cubaMode bool) (string, bool) {
	ch, ok := s.getChannel(id)
	if !ok {
		return "", false
	}
	target := strings.TrimSpace(ch.URL)
	if cubaMode {
		if strings.TrimSpace(ch.FallbackURL) != "" {
			target = strings.TrimSpace(ch.FallbackURL)
		}
	}
	if target == "" {
		target = strings.TrimSpace(ch.FallbackURL)
	}
	if target == "" {
		return "", false
	}
	if cubaMode {
		return withCubaProxy(target), true
	}
	return target, true
}

func (s *Service) ChannelsHealth(max int, cubaMode bool) []ChannelHealth {
	if max <= 0 {
		max = 12
	}
	if max > 60 {
		max = 60
	}
	channels := s.sortedChannels()
	out := make([]ChannelHealth, 0, max)

	for _, ch := range channels {
		if len(out) >= max {
			break
		}
		key := ch.ID + "|" + strconv.FormatBool(cubaMode)
		if cached, ok := s.readCachedHealth(key); ok {
			out = append(out, cached)
			continue
		}
		result := s.checkChannel(ch, cubaMode)
		s.writeCachedHealth(key, result)
		out = append(out, result)
	}
	return out
}

func (s *Service) ChannelsHealthJSON(max int, cubaMode bool) ([]byte, error) {
	items := s.ChannelsHealth(max, cubaMode)
	reachable := 0
	for _, item := range items {
		if item.Reachable {
			reachable++
		}
	}
	type out struct {
		Items       []ChannelHealth `json:"items"`
		Mode        string          `json:"mode"`
		CheckedAt   string          `json:"checked_at"`
		Total       int             `json:"total"`
		Reachable   int             `json:"reachable"`
		Unavailable int             `json:"unavailable"`
	}
	mode := "direct"
	if cubaMode {
		mode = "cuba"
	}
	return json.Marshal(out{
		Items:       items,
		Mode:        mode,
		CheckedAt:   time.Now().UTC().Format(time.RFC3339),
		Total:       len(items),
		Reachable:   reachable,
		Unavailable: len(items) - reachable,
	})
}

func (s *Service) SearchJSON(q string, max int) ([]byte, error) {
	items, err := s.Search(q, max)
	if err != nil {
		return nil, err
	}
	type out struct {
		Results []SearchItem `json:"results"`
		Cached  bool         `json:"cached"`
	}
	return json.Marshal(out{Results: items, Cached: false})
}

func (s *Service) sortedChannels() []channel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]channel, len(s.channels))
	copy(out, s.channels)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Priority == out[j].Priority {
			return out[i].Title < out[j].Title
		}
		return out[i].Priority < out[j].Priority
	})
	return out
}

func (s *Service) getChannel(id string) (channel, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ch, ok := s.byID[id]
	return ch, ok
}

func (s *Service) readCachedHealth(key string) (ChannelHealth, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	item, ok := s.healthCache[key]
	if !ok || time.Now().After(item.expiresAt) {
		return ChannelHealth{}, false
	}
	return item.value, true
}

func (s *Service) writeCachedHealth(key string, value ChannelHealth) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.healthCache[key] = cachedHealth{
		expiresAt: time.Now().Add(s.healthTTL),
		value:     value,
	}
}

func (s *Service) checkChannel(ch channel, cubaMode bool) ChannelHealth {
	start := time.Now()
	target := strings.TrimSpace(ch.URL)
	if cubaMode && strings.TrimSpace(ch.FallbackURL) != "" {
		target = strings.TrimSpace(ch.FallbackURL)
	}
	if target == "" {
		target = strings.TrimSpace(ch.FallbackURL)
	}
	target = strings.TrimSpace(target)
	if target == "" {
		return ChannelHealth{
			ID:        ch.ID,
			Title:     ch.Title,
			Channel:   ch.Channel,
			CubaMode:  cubaMode,
			CubaReady: ch.CubaReady,
			Reachable: false,
			Error:     "channel has no URL configured",
			CheckedAt: time.Now().UTC().Format(time.RFC3339),
		}
	}
	if cubaMode {
		target = withCubaProxy(target)
	}

	reachable := false
	statusCode := 0
	errStr := ""

	// First try HEAD for low bandwidth checks.
	req, err := http.NewRequest(http.MethodHead, target, nil)
	if err == nil {
		req.Header.Set("User-Agent", "RAULI-VISION/1.0 channel-health")
		resp, reqErr := s.client.Do(req)
		if reqErr == nil {
			statusCode = resp.StatusCode
			_ = resp.Body.Close()
			reachable = statusCode > 0 && statusCode < 500
		} else {
			errStr = reqErr.Error()
		}
	} else {
		errStr = err.Error()
	}

	// Retry with GET when HEAD is blocked or uncertain.
	if !reachable || statusCode == http.StatusMethodNotAllowed {
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err == nil {
			req.Header.Set("User-Agent", "RAULI-VISION/1.0 channel-health")
			req.Header.Set("Range", "bytes=0-2048")
			resp, reqErr := s.client.Do(req)
			if reqErr == nil {
				statusCode = resp.StatusCode
				_ = resp.Body.Close()
				reachable = statusCode > 0 && statusCode < 500
				if reachable {
					errStr = ""
				}
			} else if errStr == "" {
				errStr = reqErr.Error()
			}
		} else if errStr == "" {
			errStr = err.Error()
		}
	}

	return ChannelHealth{
		ID:         ch.ID,
		Title:      ch.Title,
		Channel:    ch.Channel,
		URL:        target,
		CubaMode:   cubaMode,
		CubaReady:  ch.CubaReady,
		Reachable:  reachable,
		StatusCode: statusCode,
		LatencyMS:  time.Since(start).Milliseconds(),
		Error:      errStr,
		CheckedAt:  time.Now().UTC().Format(time.RFC3339),
	}
}

func normalize(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

func matchesChannel(ch channel, query string) bool {
	if strings.Contains(normalize(ch.Title), query) {
		return true
	}
	if strings.Contains(normalize(ch.Channel), query) {
		return true
	}
	if strings.Contains(normalize(ch.Category), query) {
		return true
	}
	if strings.Contains(normalize(ch.Description), query) {
		return true
	}
	for _, tag := range ch.Tags {
		if strings.Contains(normalize(tag), query) {
			return true
		}
	}
	return false
}

func withCubaProxy(target string) string {
	base := strings.TrimSpace(os.Getenv("ATLAS_CUBA_PROXY_URL"))
	if base == "" {
		return target
	}
	bu, err := url.Parse(base)
	if err != nil || !bu.IsAbs() {
		return target
	}
	query := bu.Query()
	query.Set("url", target)
	bu.RawQuery = query.Encode()
	return bu.String()
}

func readIntEnv(name string, fallback, minValue, maxValue int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if v < minValue {
		return minValue
	}
	if v > maxValue {
		return maxValue
	}
	return v
}

func loadChannels() []channel {
	base := defaultChannels()
	path := strings.TrimSpace(os.Getenv("TV_CHANNELS_FILE"))
	if path == "" {
		return base
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return base
	}
	var custom []channel
	if err := json.Unmarshal(data, &custom); err != nil || len(custom) == 0 {
		return base
	}
	for i := range custom {
		custom[i] = normalizeChannel(custom[i], i+1)
		if custom[i].ID == "" || strings.TrimSpace(custom[i].URL) == "" {
			return base
		}
	}
	return custom
}

func normalizeChannel(ch channel, fallbackPriority int) channel {
	ch.ID = normalize(ch.ID)
	ch.Channel = strings.TrimSpace(ch.Channel)
	ch.Title = strings.TrimSpace(ch.Title)
	ch.Category = strings.TrimSpace(ch.Category)
	ch.Description = strings.TrimSpace(ch.Description)
	ch.URL = strings.TrimSpace(ch.URL)
	ch.FallbackURL = strings.TrimSpace(ch.FallbackURL)
	ch.LogoURL = strings.TrimSpace(ch.LogoURL)
	if ch.Channel == "" {
		ch.Channel = ch.Title
	}
	if ch.Category == "" {
		ch.Category = "General"
	}
	if ch.Priority <= 0 {
		ch.Priority = fallbackPriority
	}
	return ch
}

func defaultChannels() []channel {
	channels := []channel{
		{
			ID:          "rtve_24h",
			Title:       "Canal 24 Horas",
			Channel:     "RTVE",
			Category:    "Noticias Internacionales",
			Description: "Canal de noticias 24/7 de RTVE en espanol.",
			URL:         "https://www.rtve.es/play/videos/directo/canales-lineales/24h/",
			FallbackURL: "https://www.youtube.com/@24horasrtve/live",
			StreamM3U8:  "https://rtvelivestream.akamaized.net/rtvesec/canal24h/canal24h_main_576.m3u8",
			CubaReady:   true,
			Priority:    1,
			Tags:        []string{"noticias", "espana", "directo", "24h"},
		},
		{
			ID:          "tve_internacional",
			Title:       "TVE Internacional",
			Channel:     "RTVE",
			Category:    "General Internacional",
			Description: "Senal internacional oficial de TVE.",
			URL:         "https://www.rtve.es/play/videos/directo/canales-lineales/tve-internacional/",
			StreamM3U8:  "https://rtvelivestream.akamaized.net/rtvesec/tvi/tvi_main_576.m3u8",
			CubaReady:   true,
			Priority:    2,
			Tags:        []string{"rtve", "internacional", "espana"},
		},
		{
			ID:          "canal_caribe",
			Title:       "Canal Caribe",
			Channel:     "ICRT Cuba",
			Category:    "Noticias Cuba",
			Description: "Canal cubano de actualidad y cobertura en vivo.",
			URL:         "https://www.canalcaribe.icrt.cu/senal-en-vivo/",
			StreamM3U8:  "https://videoencm.nauta.cu/ICRTLive/caribe/index.m3u8",
			CubaReady:   true,
			Priority:    3,
			Tags:        []string{"cuba", "noticias", "caribe"},
		},
		{
			ID:          "cubavision_internacional",
			Title:       "Cubavision Internacional",
			Channel:     "ICRT Cuba",
			Category:    "General Cuba",
			Description: "Senal internacional de Cubavision.",
			URL:         "https://www.cubavision.icrt.cu/senal-en-vivo/",
			StreamM3U8:  "https://videoencm.nauta.cu/ICRTLive/cubavision/index.m3u8",
			CubaReady:   true,
			Priority:    4,
			Tags:        []string{"cuba", "internacional", "tv"},
		},
		{
			ID:          "telesur",
			Title:       "teleSUR",
			Channel:     "teleSUR",
			Category:    "Noticias Internacionales",
			Description: "Canal latinoamericano de noticias en vivo.",
			URL:         "https://www.telesurtv.net/en-vivo/",
			FallbackURL: "https://www.youtube.com/@teleSURtv/live",
			StreamM3U8:  "https://live.telesurtv.net/hls/telesur-espanol/index.m3u8",
			CubaReady:   true,
			Priority:    5,
			Tags:        []string{"latam", "noticias", "politica"},
		},
		{
			ID:          "dw_espanol",
			Title:       "DW Espanol",
			Channel:     "Deutsche Welle",
			Category:    "Noticias Internacionales",
			Description: "Cobertura internacional en espanol.",
			URL:         "https://www.dw.com/es/tv/directo/s-100825",
			FallbackURL: "https://www.youtube.com/@dwespanol/live",
			StreamM3U8:  "https://dwamdstream102.akamaized.net/hls/live/2015529/dwstream102/index.m3u8",
			CubaReady:   true,
			Priority:    6,
			Tags:        []string{"internacional", "alemania", "noticias"},
		},
		{
			ID:          "france24_es",
			Title:       "France 24 Espanol",
			Channel:     "France 24",
			Category:    "Noticias Internacionales",
			Description: "Noticias internacionales 24 horas en espanol.",
			URL:         "https://www.france24.com/es/en-vivo",
			FallbackURL: "https://www.youtube.com/@FRANCE24Espanol/live",
			StreamM3U8:  "https://stream.france24.com/hls/live/2037861/F24_ES_HI_HLS/master.m3u8",
			CubaReady:   true,
			Priority:    7,
			Tags:        []string{"francia", "noticias", "mundo"},
		},
		{
			ID:          "euronews_es",
			Title:       "Euronews Espanol",
			Channel:     "Euronews",
			Category:    "Noticias Internacionales",
			Description: "Senal de noticias europeas en espanol.",
			URL:         "https://es.euronews.com/live",
			FallbackURL: "https://www.youtube.com/@euronewsespanol/live",
			StreamM3U8:  "https://euronews-euronews-es-live.samsung.wurl.tv/playlist.m3u8",
			CubaReady:   true,
			Priority:    8,
			Tags:        []string{"europa", "noticias", "en vivo"},
		},
		{
			ID:          "ntn24",
			Title:       "NTN24",
			Channel:     "NTN24",
			Category:    "Noticias Internacionales",
			Description: "Canal de noticias internacional en espanol.",
			URL:         "https://www.ntn24.com/en-vivo",
			CubaReady:   true,
			Priority:    9,
			Tags:        []string{"colombia", "noticias", "latam"},
		},
		{
			ID:          "tv_azteca_noticias",
			Title:       "Azteca Noticias",
			Channel:     "TV Azteca",
			Category:    "Noticias Internacionales",
			Description: "Cobertura de noticias de Mexico.",
			URL:         "https://www.tvazteca.com/aztecanoticias/envivo",
			CubaReady:   true,
			Priority:    10,
			Tags:        []string{"mexico", "noticias"},
		},
		{
			ID:          "noticias_caracol",
			Title:       "Noticias Caracol",
			Channel:     "Caracol TV",
			Category:    "Noticias Internacionales",
			Description: "Senal en vivo de noticias Caracol.",
			URL:         "https://noticias.caracoltv.com/senal-en-vivo",
			CubaReady:   true,
			Priority:    11,
			Tags:        []string{"colombia", "noticias", "tv"},
		},
		{
			ID:          "cnn_espanol",
			Title:       "CNN en Espanol",
			Channel:     "CNN",
			Category:    "Noticias Internacionales",
			Description: "Portal de videos y coberturas de CNN en espanol.",
			URL:         "https://cnnespanol.cnn.com/category/videos/",
			CubaReady:   true,
			Priority:    12,
			Tags:        []string{"cnn", "noticias", "videos"},
		},
		// ── TikTok — acceso para Cuba ──────────────────────────────────────────
		// El sitio oficial de TikTok (tiktok.com) está geo-restringido en Cuba por
		// sanciones OFAC. El espejo ofrece dos alternativas:
		//   a) Canales YouTube con compilaciones TikTok (cuba_ready: true, disponibles ya)
		//   b) Proxy yt-dlp via /api/tiktok/fetch + /api/tiktok/stream (requiere yt-dlp)
		{
			ID:          "tiktok_viral_es",
			Title:       "TikTok Viral en Espanol",
			Channel:     "Compilaciones TikTok",
			Category:    "Entretenimiento",
			Description: "Videos virales de TikTok en espanol (via YouTube). Accesible desde Cuba.",
			URL:         "https://www.youtube.com/@tiktokviralenespanol",
			FallbackURL: "https://www.youtube.com/results?search_query=tiktok+viral+espanol+2024",
			CubaReady:   true,
			Priority:    20,
			Tags:        []string{"tiktok", "viral", "entretenimiento", "cuba"},
		},
		{
			ID:          "tiktok_directo",
			Title:       "TikTok (acceso directo)",
			Channel:     "TikTok",
			Category:    "Entretenimiento",
			Description: "Sitio oficial TikTok. NOTA: restringido en Cuba — usa /api/tiktok/fetch?url=<video_url> para acceder via espejo.",
			URL:         "https://www.tiktok.com/",
			FallbackURL: "https://www.youtube.com/results?search_query=tiktok+viral",
			CubaReady:   false,
			Priority:    21,
			Tags:        []string{"tiktok", "social", "video"},
		},
		{
			ID:          "tiktok_musica_cuba",
			Title:       "Musica y Baile Cuba - TikTok Style",
			Channel:     "Musica Latina",
			Category:    "Entretenimiento",
			Description: "Musica, baile y cultura cubana al estilo TikTok, via YouTube.",
			URL:         "https://www.youtube.com/results?search_query=musica+cubana+viral+2024",
			FallbackURL: "https://www.youtube.com/@ReggaetonViralOficial",
			CubaReady:   true,
			Priority:    22,
			Tags:        []string{"musica", "baile", "cuba", "tiktok", "viral"},
		},
	}

	for i := range channels {
		channels[i] = normalizeChannel(channels[i], i+1)
	}
	return channels
}

// reAttrURI captura URI="..." dentro de etiquetas EXT-X-* del formato m3u8.
var reAttrURI = regexp.MustCompile(`(?i)(URI=")([^"]+)(")`)

// resolveHLSURL resuelve una URL relativa de HLS respecto a la base.
func resolveHLSURL(base *url.URL, ref string) string {
	if strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") {
		return ref
	}
	u, err := base.Parse(ref)
	if err != nil {
		return ref
	}
	return u.String()
}

// rewriteM3U8 descarga el m3u8 en targetURL y reescribe todas las URIs (segmentos y
// sub-playlists) para que pasen por /api/video/hls?url=<encoded>.
func (s *Service) rewriteM3U8(targetURL string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; RauliVision/1.0)")
	req.Header.Set("Accept", "*/*")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream respondió HTTP %d", resp.StatusCode)
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20)) // 2MB max
	if err != nil {
		return nil, err
	}

	base, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}

	lines := strings.Split(string(raw), "\n")
	for i, line := range lines {
		trimmed := strings.TrimRight(line, "\r")
		// Reescribir URI="..." dentro de etiquetas EXT-X-*
		if strings.HasPrefix(trimmed, "#EXT") && strings.Contains(trimmed, "URI=") {
			lines[i] = reAttrURI.ReplaceAllStringFunc(trimmed, func(m string) string {
				parts := reAttrURI.FindStringSubmatch(m)
				if len(parts) < 4 {
					return m
				}
				abs := resolveHLSURL(base, parts[2])
				return parts[1] + "/api/video/hls?url=" + url.QueryEscape(abs) + parts[3]
			})
			continue
		}
		// Reescribir líneas URI (segmentos o sub-playlists): no empieza con # y no está vacía
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		abs := resolveHLSURL(base, trimmed)
		lines[i] = "/api/video/hls?url=" + url.QueryEscape(abs)
	}
	return []byte(strings.Join(lines, "\n")), nil
}

// ProxyHLS sirve una URL de HLS (m3u8 o segmento TS) a través del espejo.
// Si el contenido es un m3u8, reescribe todas las URIs internas para que también
// pasen por este proxy. Si es un segmento binario (TS/AAC/MP4), lo transmite tal cual.
func (s *Service) ProxyHLS(w http.ResponseWriter, targetURL string) {
	// Validación mínima de URL
	u, err := url.ParseRequestURI(targetURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		http.Error(w, "URL inválida", http.StatusBadRequest)
		return
	}

	// Determinar si es un m3u8 por extensión o query
	isM3U8 := strings.Contains(strings.ToLower(u.Path), ".m3u8") ||
		strings.Contains(strings.ToLower(u.RawQuery), ".m3u8")

	if isM3U8 {
		body, err := s.rewriteM3U8(targetURL)
		if err != nil {
			http.Error(w, "error obteniendo m3u8: "+err.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache, no-store")
		w.WriteHeader(http.StatusOK)
		w.Write(body) //nolint:errcheck
		return
	}

	// Segmento binario: proxy directo
	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
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

	// Si la respuesta es m3u8 (el servidor lo dice por Content-Type aunque la URL no lo indique)
	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "mpegurl") || strings.Contains(ct, "x-mpegurl") {
		raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		if err != nil {
			http.Error(w, "error leyendo m3u8", http.StatusBadGateway)
			return
		}
		base, _ := url.Parse(targetURL)
		lines := strings.Split(string(raw), "\n")
		for i, line := range lines {
			trimmed := strings.TrimRight(line, "\r")
			if strings.HasPrefix(trimmed, "#EXT") && strings.Contains(trimmed, "URI=") {
				lines[i] = reAttrURI.ReplaceAllStringFunc(trimmed, func(m string) string {
					parts := reAttrURI.FindStringSubmatch(m)
					if len(parts) < 4 {
						return m
					}
					abs := resolveHLSURL(base, parts[2])
					return parts[1] + "/api/video/hls?url=" + url.QueryEscape(abs) + parts[3]
				})
				continue
			}
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			abs := resolveHLSURL(base, trimmed)
			lines[i] = "/api/video/hls?url=" + url.QueryEscape(abs)
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache, no-store")
		w.Write([]byte(strings.Join(lines, "\n"))) //nolint:errcheck
		return
	}

	// Binario normal (TS, AAC, fMP4, etc.)
	for _, h := range []string{"Content-Type", "Content-Length", "Accept-Ranges", "Content-Range"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "public, max-age=10")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint:errcheck
}
