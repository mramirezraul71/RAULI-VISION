package search

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type Result struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}

type Service struct {
	client *http.Client
}

func New() *Service {
	return &Service{
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// ddgInstantAnswerResponse para la API JSON de DuckDuckGo (sin API key)
type ddgInstantAnswerResponse struct {
	Abstract      string `json:"Abstract"`
	AbstractURL   string `json:"AbstractURL"`
	RelatedTopics []struct {
		Text     string `json:"Text"`
		FirstURL string `json:"FirstURL"`
	} `json:"RelatedTopics"`
	Results []struct {
		Text     string `json:"Text"`
		FirstURL string `json:"FirstURL"`
	} `json:"Results"`
}

func (s *Service) Search(q string, max int) ([]Result, error) {
	if max <= 0 {
		max = 20
	}
	if max > 50 {
		max = 50
	}
	// 1) API DuckDuckGo Instant Answer (JSON, sin key) — siempre devuelve algo útil
	results := s.searchDuckDuckGoAPI(q, max)
	if len(results) > 0 {
		return results, nil
	}
	// 2) Scraping HTML como respaldo (puede fallar por bloqueos o cambio de HTML)
	results = s.searchDuckDuckGoHTML(q, max)
	if len(results) > 0 {
		return results, nil
	}
	// 3) Fallback amigable
	return s.fallbackResults(q, max), nil
}

func (s *Service) searchDuckDuckGoAPI(q string, max int) []Result {
	u := "https://api.duckduckgo.com/?q=" + url.QueryEscape(q) + "&format=json&no_html=1"
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "RauliVision/1.0 (lightweight)")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}
	var data ddgInstantAnswerResponse
	if err := json.Unmarshal(body, &data); err != nil {
		return nil
	}
	var out []Result
	if data.Abstract != "" && data.AbstractURL != "" {
		snippet := data.Abstract
		if len(snippet) > 200 {
			snippet = snippet[:200] + "..."
		}
		out = append(out, Result{Title: snippet, URL: data.AbstractURL, Snippet: snippet})
	}
	for _, r := range data.Results {
		if len(out) >= max {
			break
		}
		title := r.Text
		if len(title) > 120 {
			title = title[:120] + "..."
		}
		out = append(out, Result{Title: title, URL: r.FirstURL, Snippet: ""})
	}
	for _, rt := range data.RelatedTopics {
		if len(out) >= max {
			break
		}
		if rt.FirstURL == "" || rt.Text == "" {
			continue
		}
		title := rt.Text
		if len(title) > 120 {
			title = title[:120] + "..."
		}
		out = append(out, Result{Title: title, URL: rt.FirstURL, Snippet: ""})
	}
	return out
}

func (s *Service) searchDuckDuckGoHTML(q string, max int) []Result {
	u := "https://html.duckduckgo.com/html/?q=" + url.QueryEscape(q)
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}
	return s.parseDDGHTML(body, max)
}

var reLink = regexp.MustCompile(`<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]*)</a>`)
var reSnippet = regexp.MustCompile(`<a[^>]+class="result__snippet"[^>]*>([^<]*)</a>`)
var reLinkAlt = regexp.MustCompile(`<a[^>]+href="(https?://[^"]+)"[^>]*>([^<]+)</a>`)

func (s *Service) parseDDGHTML(html []byte, max int) []Result {
	content := string(html)
	links := reLink.FindAllStringSubmatch(content, -1)
	snippets := reSnippet.FindAllStringSubmatch(content, -1)
	var out []Result
	for i, m := range links {
		if i >= max {
			break
		}
		if len(m) < 3 {
			continue
		}
		rawURL := strings.TrimSpace(m[1])
		title := strings.TrimSpace(stripHTML(m[2]))
		if rawURL == "" || title == "" {
			continue
		}
		snippet := ""
		if i < len(snippets) && len(snippets[i]) >= 2 {
			snippet = strings.TrimSpace(stripHTML(snippets[i][1]))
			if len(snippet) > 200 {
				snippet = snippet[:200] + "..."
			}
		}
		out = append(out, Result{Title: title, URL: rawURL, Snippet: snippet})
	}
	if len(out) == 0 {
		// Intentar regex más genérico por si cambió el HTML
		all := reLinkAlt.FindAllStringSubmatch(content, max*2)
		seen := make(map[string]bool)
		for _, m := range all {
			if len(out) >= max {
				break
			}
			if len(m) < 3 {
				continue
			}
			rawURL := strings.TrimSpace(m[1])
			title := strings.TrimSpace(stripHTML(m[2]))
			if rawURL == "" || title == "" || len(title) < 4 {
				continue
			}
			if seen[rawURL] {
				continue
			}
			seen[rawURL] = true
			out = append(out, Result{Title: title, URL: rawURL, Snippet: ""})
		}
	}
	return out
}

func stripHTML(s string) string {
	s = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(s, " ")
	s = regexp.MustCompile(`\s+`).ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func (s *Service) fallbackResults(q string, max int) []Result {
	return []Result{
		{Title: "Búsqueda: " + q, URL: "https://duckduckgo.com/?q=" + url.QueryEscape(q), Snippet: "Sin resultados directos. Puede buscar en DuckDuckGo con el enlace anterior."},
	}
}

func (s *Service) SearchJSON(q string, max int) ([]byte, error) {
	results, err := s.Search(q, max)
	if err != nil {
		return nil, err
	}
	type out struct {
		Query   string   `json:"query"`
		Results []Result `json:"results"`
		Cached  bool     `json:"cached"`
	}
	return json.Marshal(out{Query: q, Results: results, Cached: false})
}
