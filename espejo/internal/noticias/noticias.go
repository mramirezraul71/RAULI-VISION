// Package noticias provee un agregador de noticias RSS sin dependencias externas.
package noticias

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Article representa un artículo de noticias.
type Article struct {
	Title     string `json:"title"`
	Link      string `json:"link"`
	Desc      string `json:"description"`
	PubDate   string `json:"pub_date"`
	Source    string `json:"source"`
	SourceKey string `json:"source_key"`
	ImageURL  string `json:"image_url,omitempty"`
}

// Feed describe una fuente RSS disponible.
type Feed struct {
	Key      string `json:"key"`
	Name     string `json:"name"`
	URL      string `json:"url"`
	Category string `json:"category"` // "cuba" | "internacional" | "tecnologia" | "deporte"
	Language string `json:"language"` // "es" | "en"
}

// Catálogo de feeds curados. Sin API key — son RSS públicos.
var defaultFeeds = []Feed{
	{Key: "14ymedio", Name: "14ymedio", URL: "https://www.14ymedio.com/rss.xml", Category: "cuba", Language: "es"},
	{Key: "cibercuba", Name: "CiberCuba", URL: "https://www.cibercuba.com/rss.xml", Category: "cuba", Language: "es"},
	{Key: "oncuba", Name: "OnCuba News", URL: "https://oncubanews.com/feed/", Category: "cuba", Language: "es"},
	{Key: "bbc_mundo", Name: "BBC Mundo", URL: "https://feeds.bbci.co.uk/mundo/rss.xml", Category: "internacional", Language: "es"},
	{Key: "dw_es", Name: "DW Español", URL: "https://rss.dw.com/rdf/rss-es-all", Category: "internacional", Language: "es"},
	{Key: "rt_es", Name: "RT en Español", URL: "https://actualidad.rt.com/rss", Category: "internacional", Language: "es"},
	{Key: "el_pais", Name: "El País", URL: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada", Category: "internacional", Language: "es"},
	{Key: "infobae", Name: "Infobae", URL: "https://www.infobae.com/feeds/rss/", Category: "internacional", Language: "es"},
	{Key: "cnn_es", Name: "CNN en Español", URL: "https://cnnespanol.cnn.com/feed/", Category: "internacional", Language: "es"},
	{Key: "xataka", Name: "Xataka", URL: "https://www.xataka.com/feedburner.xml", Category: "tecnologia", Language: "es"},
	{Key: "genbeta", Name: "Genbeta", URL: "https://www.genbeta.com/feedburner.xml", Category: "tecnologia", Language: "es"},
	{Key: "hipertextual", Name: "Hipertextual", URL: "https://hipertextual.com/feed", Category: "tecnologia", Language: "es"},
}

// Structs para parsear RSS/Atom con encoding/xml estándar.
type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	PubDate     string `xml:"pubDate"`
	Enclosure   struct {
		URL string `xml:"url,attr"`
	} `xml:"enclosure"`
}

type rssChannel struct {
	Items []rssItem `xml:"item"`
}

type rssFeed struct {
	Channel rssChannel `xml:"channel"`
}

type feedCache struct {
	articles  []Article
	fetchedAt time.Time
}

// Service gestiona la obtención y caché de noticias RSS.
type Service struct {
	client   *http.Client
	feeds    []Feed
	mu       sync.RWMutex
	cache    map[string]feedCache
	cacheTTL time.Duration
}

var (
	htmlTagRe  = regexp.MustCompile(`<[^>]+>`)
	mediaURLRe = regexp.MustCompile(`(?i)media:content[^>]+url="([^"]+)"`)
	imgSrcRe   = regexp.MustCompile(`(?i)<img[^>]+src="([^"]+)"`)
	cdataRe    = regexp.MustCompile(`(?s)<!\[CDATA\[(.*?)\]\]>`)
)

// New crea un Service e inicia la precarga asíncrona de feeds.
func New() *Service {
	s := &Service{
		client: &http.Client{
			Timeout: 12 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("demasiadas redirecciones")
				}
				return nil
			},
		},
		feeds:    defaultFeeds,
		cache:    make(map[string]feedCache),
		cacheTTL: 20 * time.Minute,
	}
	go s.warmup()
	return s
}

func (s *Service) warmup() {
	for _, f := range s.feeds {
		s.fetchFeed(f.Key)                //nolint: errcheck — silencioso en warmup
		time.Sleep(600 * time.Millisecond) // escalonado para no saturar en startup
	}
}

// ListFeeds devuelve el catálogo de feeds disponibles.
func (s *Service) ListFeeds() []Feed { return s.feeds }

// FetchFeed obtiene artículos de un feed específico.
func (s *Service) FetchFeed(key string, limit int) ([]Article, error) {
	articles, err := s.fetchFeed(key)
	if err != nil {
		return nil, err
	}
	if limit > 0 && len(articles) > limit {
		articles = articles[:limit]
	}
	return articles, nil
}

func (s *Service) fetchFeed(key string) ([]Article, error) {
	s.mu.RLock()
	if c, ok := s.cache[key]; ok && time.Since(c.fetchedAt) < s.cacheTTL {
		s.mu.RUnlock()
		return c.articles, nil
	}
	s.mu.RUnlock()

	var feedMeta Feed
	for _, f := range s.feeds {
		if f.Key == key {
			feedMeta = f
			break
		}
	}
	if feedMeta.URL == "" {
		return nil, fmt.Errorf("feed desconocido: %s", key)
	}

	req, _ := http.NewRequest(http.MethodGet, feedMeta.URL, nil)
	req.Header.Set("User-Agent", "RauliVision/1.0 RSS Reader (+https://vision.rauliatlasapp.com)")
	req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml, */*")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error obteniendo feed %s: %w", key, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("feed %s respondió HTTP %d", key, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // máx 1MB
	if err != nil {
		return nil, fmt.Errorf("error leyendo feed %s: %w", key, err)
	}

	bodyStr := string(body)

	var feed rssFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("error parseando RSS %s: %w", key, err)
	}

	articles := make([]Article, 0, len(feed.Channel.Items))
	for _, item := range feed.Channel.Items {
		title := cleanText(item.Title)
		link := strings.TrimSpace(item.Link)
		desc := cleanText(item.Description)

		if utf8.RuneCountInString(desc) > 280 {
			runes := []rune(desc)
			desc = string(runes[:280]) + "…"
		}

		// Imagen: prioridad enclosure > media:content en raw XML > img en description
		imgURL := item.Enclosure.URL
		if imgURL == "" {
			if m := mediaURLRe.FindStringSubmatch(bodyStr); len(m) > 1 {
				imgURL = m[1]
			}
		}
		if imgURL == "" {
			if m := imgSrcRe.FindStringSubmatch(item.Description); len(m) > 1 {
				imgURL = m[1]
			}
		}

		if title == "" || link == "" {
			continue
		}

		articles = append(articles, Article{
			Title:     title,
			Link:      link,
			Desc:      desc,
			PubDate:   item.PubDate,
			Source:    feedMeta.Name,
			SourceKey: key,
			ImageURL:  imgURL,
		})
	}

	s.mu.Lock()
	s.cache[key] = feedCache{articles: articles, fetchedAt: time.Now()}
	s.mu.Unlock()

	return articles, nil
}

// FetchByCategory obtiene artículos de todos los feeds de una categoría, mezclados y ordenados.
func (s *Service) FetchByCategory(category string, limit int) ([]Article, error) {
	if limit <= 0 {
		limit = 30
	}
	var all []Article
	for _, f := range s.feeds {
		if category != "" && f.Category != category {
			continue
		}
		articles, err := s.fetchFeed(f.Key)
		if err != nil {
			continue // feed falla → skip silencioso
		}
		all = append(all, articles...)
	}

	sort.SliceStable(all, func(i, j int) bool {
		ti := parsePubDate(all[i].PubDate)
		tj := parsePubDate(all[j].PubDate)
		return ti.After(tj)
	})

	if len(all) > limit {
		all = all[:limit]
	}
	return all, nil
}

func parsePubDate(s string) time.Time {
	formats := []string{
		time.RFC1123Z,
		time.RFC1123,
		time.RFC822Z,
		time.RFC822,
		"Mon, 02 Jan 2006 15:04:05 -0700",
		"Mon, 2 Jan 2006 15:04:05 -0700",
		time.RFC3339,
	}
	for _, f := range formats {
		if t, err := time.Parse(f, strings.TrimSpace(s)); err == nil {
			return t
		}
	}
	return time.Time{}
}

func cleanText(s string) string {
	if m := cdataRe.FindStringSubmatch(s); len(m) > 1 {
		s = m[1]
	}
	s = htmlTagRe.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", `"`)
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "&apos;", "'")
	s = strings.Join(strings.Fields(s), " ")
	return strings.TrimSpace(s)
}

// FetchByCategoryJSON devuelve artículos de una categoría como JSON.
func (s *Service) FetchByCategoryJSON(category string, limit int) ([]byte, error) {
	articles, err := s.FetchByCategory(category, limit)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]interface{}{
		"articles": articles,
		"category": category,
		"total":    len(articles),
	})
}

// FetchFeedJSON devuelve artículos de un feed específico como JSON.
func (s *Service) FetchFeedJSON(key string, limit int) ([]byte, error) {
	articles, err := s.FetchFeed(key, limit)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]interface{}{
		"articles": articles,
		"source":   key,
		"total":    len(articles),
	})
}
