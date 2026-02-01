package search

import (
	"encoding/json"
	"testing"
)

func TestFallbackResults(t *testing.T) {
	s := New()
	results := s.fallbackResults("test query", 5)
	if len(results) != 1 {
		t.Fatalf("len(results) = %d, want 1", len(results))
	}
	if results[0].Title != "Búsqueda: test query" {
		t.Errorf("Title = %q", results[0].Title)
	}
	if results[0].URL == "" {
		t.Error("URL is empty")
	}
}

func TestParseDDGHTML(t *testing.T) {
	s := New()
	// HTML simplificado con clase result__a (formato DuckDuckGo)
	html := `
	<body>
		<a class="result__a" href="https://example.com">Example Site</a>
		<a class="result__snippet">Snippet text here</a>
		<a class="result__a" href="https://other.com">Other</a>
	</body>`
	results := s.parseDDGHTML([]byte(html), 10)
	if len(results) < 1 {
		t.Fatalf("parseDDGHTML: got %d results", len(results))
	}
	if results[0].URL != "https://example.com" {
		t.Errorf("URL = %q", results[0].URL)
	}
	if results[0].Title != "Example Site" {
		t.Errorf("Title = %q", results[0].Title)
	}
}

func TestStripHTML(t *testing.T) {
	got := stripHTML("<b>hello</b> world <br/>")
	if got != "hello world" {
		t.Errorf("stripHTML = %q", got)
	}
}

func TestSearchJSON_Fallback(t *testing.T) {
	// Search() puede llamar a la API real; probamos SearchJSON con un query que
	// en entorno sin red o con API limitada puede acabar en fallback.
	// Para test estable sin red, no llamamos Search() directamente.
	// Verificamos que fallbackResults + estructura JSON es correcta.
	s := New()
	results := s.fallbackResults("unit", 3)
	data, err := json.Marshal(struct {
		Query   string   `json:"query"`
		Results []Result `json:"results"`
	}{Query: "unit", Results: results})
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Query   string   `json:"query"`
		Results []Result `json:"results"`
	}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Query != "unit" || len(decoded.Results) != 1 {
		t.Errorf("decoded: query=%q len(results)=%d", decoded.Query, len(decoded.Results))
	}
}
