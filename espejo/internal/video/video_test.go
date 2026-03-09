package video

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSearchReturnsChannels(t *testing.T) {
	svc := New()
	items, err := svc.Search("", 5)
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if len(items) == 0 {
		t.Fatal("expected at least one channel")
	}
	if items[0].ID == "" || items[0].Title == "" {
		t.Fatalf("unexpected first item: %+v", items[0])
	}
}

func TestMetaAndStreamURL(t *testing.T) {
	svc := New()
	meta, ok := svc.Meta("rtve_24h")
	if !ok {
		t.Fatal("expected rtve_24h to exist")
	}
	if meta.Title == "" || !meta.Live {
		t.Fatalf("unexpected meta: %+v", meta)
	}
	stream, ok := svc.StreamURL("rtve_24h", false)
	if !ok || stream == "" {
		t.Fatal("expected a direct stream URL")
	}
}

func TestChannelsHealthFromCustomCatalog(t *testing.T) {
	testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer testServer.Close()

	tmpDir := t.TempDir()
	customPath := filepath.Join(tmpDir, "tv_channels.json")
	custom := []map[string]interface{}{
		{
			"id":         "test_channel",
			"title":      "Test Channel",
			"channel":    "Unit",
			"url":        testServer.URL,
			"cuba_ready": true,
			"priority":   1,
		},
	}
	raw, err := json.Marshal(custom)
	if err != nil {
		t.Fatalf("marshal custom catalog: %v", err)
	}
	if err := os.WriteFile(customPath, raw, 0o644); err != nil {
		t.Fatalf("write custom catalog: %v", err)
	}

	t.Setenv("TV_CHANNELS_FILE", customPath)
	svc := New()
	items := svc.ChannelsHealth(1, false)
	if len(items) != 1 {
		t.Fatalf("expected 1 health item, got %d", len(items))
	}
	if !items[0].Reachable {
		t.Fatalf("expected channel to be reachable, got %+v", items[0])
	}
}
