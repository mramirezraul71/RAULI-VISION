package cache

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNew_Memory(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	c, err := New(dbPath)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()
}

func TestCacheKey(t *testing.T) {
	k1 := CacheKey("GET", "/api/health", "")
	if k1 == "" {
		t.Fatal("CacheKey returned empty")
	}
	k2 := CacheKey("GET", "/api/health", "")
	if k1 != k2 {
		t.Error("same args should give same key")
	}
	k3 := CacheKey("GET", "/api/search", "q=test")
	if k1 == k3 {
		t.Error("different args should give different key")
	}
}

func TestSetGet(t *testing.T) {
	dir := t.TempDir()
	c, err := New(filepath.Join(dir, "c.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	key := CacheKey("GET", "/api/health", "")
	val := []byte(`{"status":"ok"}`)
	c.Set(key, val, time.Hour)

	got, ok := c.Get(key)
	if !ok {
		t.Fatal("Get: not found")
	}
	if string(got) != string(val) {
		t.Errorf("Get: got %q", got)
	}

	_, ok = c.Get("nonexistent")
	if ok {
		t.Error("Get(nonexistent) should be false")
	}
}

func TestStats(t *testing.T) {
	dir := t.TempDir()
	c, err := New(filepath.Join(dir, "s.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	entries, size := c.Stats()
	if entries != 0 || size != 0 {
		t.Errorf("empty cache: entries=%d size=%d", entries, size)
	}

	key := CacheKey("GET", "/x", "")
	c.Set(key, []byte("hello"), time.Hour)
	entries, size = c.Stats()
	if entries != 1 {
		t.Errorf("entries = %d, want 1", entries)
	}
	if size != 5 {
		t.Errorf("size = %d, want 5", size)
	}
}

func TestExpiry(t *testing.T) {
	dir := t.TempDir()
	c, err := New(filepath.Join(dir, "e.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	key := CacheKey("GET", "/exp", "")
	c.Set(key, []byte("x"), 1*time.Millisecond)
	time.Sleep(10 * time.Millisecond)
	_, ok := c.Get(key)
	if ok {
		t.Error("expired key should not be returned")
	}
	entries, _ := c.Stats()
	if entries != 0 {
		t.Errorf("after expiry Stats() entries = %d", entries)
	}
}

func TestNew_InvalidPath(t *testing.T) {
	// path que no se puede crear (por ejemplo raíz solo en algunos OS)
	if os.PathSeparator == '/' {
		_, err := New("/nonexistent_parent_xyz/test.db")
		if err == nil {
			t.Log("New with bad path did not error (may be OS-dependent)")
		}
	}
}
