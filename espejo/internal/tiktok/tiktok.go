// Package tiktok provee acceso a contenido de TikTok para usuarios en regiones
// con restricciones geopolíticas (ej. Cuba).
//
// Estrategia multicapa (sin yt-dlp):
//   1. Cobalt API  — API pública open-source, soporta 20+ plataformas
//   2. tikwm.com   — API REST dedicada a TikTok, capa gratuita
//   3. yt-dlp      — fallback local si está instalado en el servidor
package tiktok

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// VideoInfo contiene los metadatos del video.
type VideoInfo struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Uploader     string `json:"uploader"`
	DurationSec  int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	StreamURL    string `json:"stream_url"`
	OriginalURL  string `json:"original_url"`
	Source       string `json:"source"` // "cobalt" | "tikwm" | "ytdlp"
	CubaReady    bool   `json:"cuba_ready"`
}

// Service gestiona las peticiones de contenido TikTok con estrategia multicapa.
type Service struct {
	mu        sync.Mutex
	cache     map[string]cacheEntry
	cacheTTL  time.Duration
	ytdlpPath string
	client    *http.Client
}

type cacheEntry struct {
	info      VideoInfo
	expiresAt time.Time
}

// New crea un nuevo Service.
func New() *Service {
	return &Service{
		cache:     make(map[string]cacheEntry),
		cacheTTL:  10 * time.Minute,
		ytdlpPath: detectYtdlp(),
		client:    &http.Client{Timeout: 20 * time.Second},
	}
}

// Available siempre devuelve true: Cobalt y tikwm no requieren instalación local.
func (s *Service) Available() bool {
	return true
}

// FetchInfo extrae metadatos y URL de stream de un video de TikTok.
// Prueba Cobalt → tikwm → yt-dlp en ese orden.
func (s *Service) FetchInfo(rawURL string) (VideoInfo, error) {
	if err := validateTikTokURL(rawURL); err != nil {
		return VideoInfo{}, err
	}

	// Revisar caché
	s.mu.Lock()
	if entry, ok := s.cache[rawURL]; ok && time.Now().Before(entry.expiresAt) {
		s.mu.Unlock()
		return entry.info, nil
	}
	s.mu.Unlock()

	// Capa 1: Cobalt API
	if info, err := s.fetchViaCobalt(rawURL); err == nil {
		s.setCache(rawURL, info)
		return info, nil
	}

	// Capa 2: tikwm.com
	if info, err := s.fetchViaTikwm(rawURL); err == nil {
		s.setCache(rawURL, info)
		return info, nil
	}

	// Capa 3: yt-dlp (si está instalado)
	if s.ytdlpPath != "" {
		if info, err := s.fetchViaYtdlp(rawURL); err == nil {
			s.setCache(rawURL, info)
			return info, nil
		}
	}

	return VideoInfo{}, errors.New("no se pudo obtener el video por ninguna vía disponible (cobalt, tikwm, yt-dlp)")
}

// ProxyStream retransmite el video al cliente sin que éste contacte TikTok.
func (s *Service) ProxyStream(w http.ResponseWriter, videoURL string) {
	req, err := http.NewRequest(http.MethodGet, videoURL, nil)
	if err != nil {
		http.Error(w, "URL de stream inválida", http.StatusBadGateway)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; RAULI-VISION/1.0)")
	req.Header.Set("Referer", "https://www.tiktok.com/")

	resp, err := s.client.Do(req)
	if err != nil {
		http.Error(w, "No se pudo obtener el stream: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for _, h := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// ─── Capa 1: Cobalt API ───────────────────────────────────────────────────────
// Cobalt es un proyecto open-source (github.com/imputnet/cobalt) con API pública.
// Documentación: https://github.com/imputnet/cobalt/blob/main/docs/api.md

type cobaltRequest struct {
	URL string `json:"url"`
}

type cobaltResponse struct {
	Status string `json:"status"` // "stream" | "redirect" | "picker" | "error"
	URL    string `json:"url"`
	Text   string `json:"text"`
}

func (s *Service) fetchViaCobalt(rawURL string) (VideoInfo, error) {
	body, _ := json.Marshal(cobaltRequest{URL: rawURL})
	req, err := http.NewRequest(http.MethodPost, "https://api.cobalt.tools/", bytes.NewReader(body))
	if err != nil {
		return VideoInfo{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return VideoInfo{}, fmt.Errorf("cobalt unreachable: %w", err)
	}
	defer resp.Body.Close()

	var cr cobaltResponse
	if err := json.NewDecoder(resp.Body).Decode(&cr); err != nil {
		return VideoInfo{}, fmt.Errorf("cobalt respuesta inválida: %w", err)
	}
	if (cr.Status != "stream" && cr.Status != "redirect") || cr.URL == "" {
		return VideoInfo{}, fmt.Errorf("cobalt error: %s", cr.Text)
	}

	return VideoInfo{
		StreamURL:   cr.URL,
		OriginalURL: rawURL,
		Source:      "cobalt",
		CubaReady:   true,
		Title:       "Video TikTok",
	}, nil
}

// ─── Capa 2: tikwm.com API ────────────────────────────────────────────────────
// API REST dedicada a TikTok. Capa gratuita sin auth.
// https://www.tikwm.com/

type tikwmResponse struct {
	Code int    `json:"code"` // 0 = OK
	Msg  string `json:"msg"`
	Data struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Duration int    `json:"duration"`
		Play     string `json:"play"`    // URL MP4 sin marca de agua
		HdPlay   string `json:"hdplay"`  // URL HD
		Cover    string `json:"cover"`   // thumbnail
		Author   struct {
			Nickname string `json:"nickname"`
		} `json:"author"`
	} `json:"data"`
}

func (s *Service) fetchViaTikwm(rawURL string) (VideoInfo, error) {
	apiURL := "https://www.tikwm.com/api/?url=" + url.QueryEscape(rawURL) + "&hd=1"
	resp, err := s.client.Get(apiURL)
	if err != nil {
		return VideoInfo{}, fmt.Errorf("tikwm unreachable: %w", err)
	}
	defer resp.Body.Close()

	var tr tikwmResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return VideoInfo{}, fmt.Errorf("tikwm respuesta inválida: %w", err)
	}
	if tr.Code != 0 || tr.Data.Play == "" {
		return VideoInfo{}, fmt.Errorf("tikwm error: %s", tr.Msg)
	}

	streamURL := tr.Data.HdPlay
	if streamURL == "" {
		streamURL = tr.Data.Play
	}

	return VideoInfo{
		ID:           tr.Data.ID,
		Title:        tr.Data.Title,
		Uploader:     tr.Data.Author.Nickname,
		DurationSec:  tr.Data.Duration,
		ThumbnailURL: tr.Data.Cover,
		StreamURL:    streamURL,
		OriginalURL:  rawURL,
		Source:       "tikwm",
		CubaReady:    true,
	}, nil
}

// ─── Capa 3: yt-dlp (fallback local) ─────────────────────────────────────────

type ytdlpOutput struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Uploader string  `json:"uploader"`
	Duration float64 `json:"duration"`
	Thumbnail string `json:"thumbnail"`
	URL      string  `json:"url"`
	Formats  []struct {
		URL    string `json:"url"`
		Ext    string `json:"ext"`
		Height int    `json:"height"`
	} `json:"formats"`
}

func (s *Service) fetchViaYtdlp(rawURL string) (VideoInfo, error) {
	cmd := exec.Command(s.ytdlpPath,
		"--no-playlist", "--dump-json", "--no-warnings",
		"-f", "mp4[height<=480]/best[ext=mp4]/best",
		rawURL,
	)
	out, err := cmd.Output()
	if err != nil {
		cmd2 := exec.Command(s.ytdlpPath, "--no-playlist", "--dump-json", "--no-warnings", rawURL)
		out, err = cmd2.Output()
		if err != nil {
			return VideoInfo{}, fmt.Errorf("yt-dlp falló: %w", err)
		}
	}

	var yt ytdlpOutput
	if err := json.Unmarshal(out, &yt); err != nil {
		return VideoInfo{}, fmt.Errorf("respuesta yt-dlp inválida: %w", err)
	}

	streamURL := yt.URL
	if streamURL == "" {
		for _, f := range yt.Formats {
			if f.Ext == "mp4" && f.URL != "" {
				streamURL = f.URL
				break
			}
		}
		if streamURL == "" && len(yt.Formats) > 0 {
			streamURL = yt.Formats[len(yt.Formats)-1].URL
		}
	}
	if streamURL == "" {
		return VideoInfo{}, errors.New("yt-dlp no devolvió URL de stream")
	}

	return VideoInfo{
		ID: yt.ID, Title: yt.Title, Uploader: yt.Uploader,
		DurationSec: int(yt.Duration), ThumbnailURL: yt.Thumbnail,
		StreamURL: streamURL, OriginalURL: rawURL,
		Source: "ytdlp", CubaReady: true,
	}, nil
}

// ─── Feed & Search (tikwm) ────────────────────────────────────────────────────

// FeedItem representa un video del feed de tendencias o búsqueda.
type FeedItem struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Uploader     string `json:"uploader"`
	Avatar       string `json:"avatar,omitempty"`
	DurationSec  int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	StreamURL    string `json:"stream_url"`
	DiggCount    int    `json:"digg_count,omitempty"`
	CommentCount int    `json:"comment_count,omitempty"`
	ShareCount   int    `json:"share_count,omitempty"`
}

// tikwm /api/feed/list — data is a direct array
type tikwmTrendResponse struct {
	Code int              `json:"code"`
	Msg  string           `json:"msg"`
	Data []tikwmVideoItem `json:"data"`
}

// tikwm /api/feed/search — data is an object with videos + cursor
type tikwmSearchResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		Videos  []tikwmVideoItem `json:"videos"`
		Cursor  int              `json:"cursor"`
		HasMore bool             `json:"hasMore"`
	} `json:"data"`
}

type tikwmVideoItem struct {
	VideoID  string `json:"video_id"` // feed uses video_id
	ID       string `json:"id"`       // single-video uses id
	Title    string `json:"title"`
	Play     string `json:"play"`
	HdPlay   string `json:"hdplay"`
	Cover    string `json:"cover"`
	Duration int    `json:"duration"`
	Author   struct {
		Nickname string `json:"nickname"`
		Avatar   string `json:"avatar"`
	} `json:"author"`
	DiggCount    int `json:"digg_count"`
	CommentCount int `json:"comment_count"`
	ShareCount   int `json:"share_count"`
}

func (v *tikwmVideoItem) effectiveID() string {
	if v.VideoID != "" {
		return v.VideoID
	}
	return v.ID
}

func tikwmItemToFeed(v tikwmVideoItem) (FeedItem, bool) {
	stream := v.HdPlay
	if stream == "" {
		stream = v.Play
	}
	if stream == "" {
		return FeedItem{}, false
	}
	return FeedItem{
		ID:           v.effectiveID(),
		Title:        v.Title,
		Uploader:     v.Author.Nickname,
		Avatar:       v.Author.Avatar,
		DurationSec:  v.Duration,
		ThumbnailURL: v.Cover,
		StreamURL:    stream,
		DiggCount:    v.DiggCount,
		CommentCount: v.CommentCount,
		ShareCount:   v.ShareCount,
	}, true
}

// FetchTrending devuelve el feed de videos en tendencia global vía tikwm.com.
func (s *Service) FetchTrending(count int, _ string) ([]FeedItem, string, bool, error) {
	if count <= 0 || count > 30 {
		count = 20
	}
	apiURL := fmt.Sprintf("https://www.tikwm.com/api/feed/list?count=%d&region=US", count)
	resp, err := s.client.Get(apiURL)
	if err != nil {
		return nil, "", false, fmt.Errorf("tikwm feed inalcanzable: %w", err)
	}
	defer resp.Body.Close()

	var tr tikwmTrendResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, "", false, fmt.Errorf("tikwm feed respuesta inválida: %w", err)
	}
	if tr.Code != 0 {
		return nil, "", false, fmt.Errorf("tikwm feed error: %s", tr.Msg)
	}

	items := make([]FeedItem, 0, len(tr.Data))
	for _, v := range tr.Data {
		if item, ok := tikwmItemToFeed(v); ok {
			items = append(items, item)
		}
	}
	return items, "", false, nil
}

// SearchVideos busca videos de TikTok por palabras clave vía tikwm.com.
func (s *Service) SearchVideos(query string, count int, cursor string) ([]FeedItem, string, bool, error) {
	if count <= 0 || count > 30 {
		count = 20
	}
	cur := "0"
	if cursor != "" {
		cur = cursor
	}
	apiURL := fmt.Sprintf("https://www.tikwm.com/api/feed/search?keywords=%s&count=%d&cursor=%s",
		url.QueryEscape(query), count, cur)
	resp, err := s.client.Get(apiURL)
	if err != nil {
		return nil, "", false, fmt.Errorf("tikwm search inalcanzable: %w", err)
	}
	defer resp.Body.Close()

	var tr tikwmSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, "", false, fmt.Errorf("tikwm search respuesta inválida: %w", err)
	}
	if tr.Code != 0 {
		return nil, "", false, fmt.Errorf("tikwm search error: %s", tr.Msg)
	}

	items := make([]FeedItem, 0, len(tr.Data.Videos))
	for _, v := range tr.Data.Videos {
		if item, ok := tikwmItemToFeed(v); ok {
			items = append(items, item)
		}
	}
	nextCursor := fmt.Sprintf("%d", tr.Data.Cursor)
	return items, nextCursor, tr.Data.HasMore, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (s *Service) setCache(key string, info VideoInfo) {
	s.mu.Lock()
	s.cache[key] = cacheEntry{info: info, expiresAt: time.Now().Add(s.cacheTTL)}
	s.mu.Unlock()
}

func detectYtdlp() string {
	for _, name := range []string{"yt-dlp", "yt-dlp.exe", "youtube-dl", "youtube-dl.exe"} {
		if path, err := exec.LookPath(name); err == nil {
			return path
		}
	}
	return ""
}

func validateTikTokURL(rawURL string) error {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return errors.New("url requerida")
	}
	u, err := url.Parse(rawURL)
	if err != nil || !u.IsAbs() {
		return errors.New("url inválida")
	}
	host := strings.ToLower(u.Hostname())
	for _, a := range []string{"tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"} {
		if host == a {
			return nil
		}
	}
	return fmt.Errorf("dominio no permitido: %s (solo tiktok.com)", host)
}
