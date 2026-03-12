// Package tiktok provee acceso a contenido de TikTok para usuarios en regiones
// con restricciones geopolíticas (ej. Cuba). El espejo, al estar fuera de esas
// regiones, puede obtener la URL de stream directa usando yt-dlp y retransmitirla.
package tiktok

import (
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

// VideoInfo contiene los metadatos del video extraídos por yt-dlp.
type VideoInfo struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Uploader    string `json:"uploader"`
	DurationSec int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	StreamURL   string `json:"stream_url"`
	OriginalURL string `json:"original_url"`
	Source      string `json:"source"`
	CubaReady   bool   `json:"cuba_ready"`
}

// ytdlpOutput es la estructura JSON que produce yt-dlp con -J.
type ytdlpOutput struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Uploader    string  `json:"uploader"`
	Duration    float64 `json:"duration"`
	Thumbnail   string  `json:"thumbnail"`
	URL         string  `json:"url"`
	RequestedURL string  `json:"webpage_url"`
	Formats     []struct {
		URL    string `json:"url"`
		Ext    string `json:"ext"`
		Height int    `json:"height"`
	} `json:"formats"`
}

// Service gestiona las peticiones de contenido TikTok.
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

// New crea un nuevo Service. Detecta automáticamente la ruta de yt-dlp.
func New() *Service {
	ytdlp := detectYtdlp()
	return &Service{
		cache:     make(map[string]cacheEntry),
		cacheTTL:  10 * time.Minute,
		ytdlpPath: ytdlp,
		client:    &http.Client{Timeout: 20 * time.Second},
	}
}

// Available indica si yt-dlp está instalado en el sistema.
func (s *Service) Available() bool {
	return s.ytdlpPath != ""
}

// FetchInfo extrae metadatos y URL de stream de un video de TikTok.
// Devuelve error si yt-dlp no está disponible o la URL no es de TikTok.
func (s *Service) FetchInfo(rawURL string) (VideoInfo, error) {
	if err := validateTikTokURL(rawURL); err != nil {
		return VideoInfo{}, err
	}
	if !s.Available() {
		return VideoInfo{}, errors.New("yt-dlp no está instalado en el espejo; instala con: pip install yt-dlp")
	}

	// Revisar caché
	s.mu.Lock()
	if entry, ok := s.cache[rawURL]; ok && time.Now().Before(entry.expiresAt) {
		s.mu.Unlock()
		return entry.info, nil
	}
	s.mu.Unlock()

	info, err := s.runYtdlp(rawURL)
	if err != nil {
		return VideoInfo{}, fmt.Errorf("yt-dlp error: %w", err)
	}

	s.mu.Lock()
	s.cache[rawURL] = cacheEntry{info: info, expiresAt: time.Now().Add(s.cacheTTL)}
	s.mu.Unlock()

	return info, nil
}

// ProxyStream hace de proxy entre el cliente (en Cuba) y la URL directa del video.
// Esto evita que el cliente tenga que conectarse a servidores de TikTok (bloqueados).
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

	// Propagar headers relevantes
	for _, h := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (s *Service) runYtdlp(rawURL string) (VideoInfo, error) {
	// Extraer info en JSON sin descargar, preferir formato mp4/360p
	cmd := exec.Command(s.ytdlpPath,
		"--no-playlist",
		"--dump-json",
		"--no-warnings",
		"-f", "mp4[height<=480]/best[ext=mp4]/best",
		rawURL,
	)
	out, err := cmd.Output()
	if err != nil {
		// Intentar sin restricción de formato
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
	// Si no hay URL directa, buscar en formats el mejor mp4
	if streamURL == "" && len(yt.Formats) > 0 {
		for _, f := range yt.Formats {
			if f.Ext == "mp4" && f.URL != "" {
				streamURL = f.URL
				break
			}
		}
		if streamURL == "" {
			streamURL = yt.Formats[len(yt.Formats)-1].URL
		}
	}
	if streamURL == "" {
		return VideoInfo{}, errors.New("yt-dlp no devolvió URL de stream")
	}

	return VideoInfo{
		ID:          yt.ID,
		Title:       yt.Title,
		Uploader:    yt.Uploader,
		DurationSec: int(yt.Duration),
		ThumbnailURL: yt.Thumbnail,
		StreamURL:   streamURL,
		OriginalURL: rawURL,
		Source:      "tiktok",
		CubaReady:   true,
	}, nil
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
	allowed := []string{"tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"}
	for _, a := range allowed {
		if host == a {
			return nil
		}
	}
	return fmt.Errorf("dominio no permitido: %s (solo tiktok.com)", host)
}
