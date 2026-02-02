//go:build cgo
// +build cgo

package cache

import (
	"database/sql"
	"encoding/base64"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Cache struct {
	db  *sql.DB
	mu  sync.RWMutex
	ttl time.Duration
}

func New(dbPath string) (*Cache, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		return nil, err
	}
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS cache (
			key TEXT PRIMARY KEY,
			value BLOB,
			expires_at INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_expires ON cache(expires_at);
	`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Cache{db: db, ttl: 24 * time.Hour}, nil
}

func (c *Cache) Get(key string) ([]byte, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var val []byte
	var exp int64
	err := c.db.QueryRow("SELECT value, expires_at FROM cache WHERE key = ? AND expires_at > ?", key, time.Now().Unix()).Scan(&val, &exp)
	if err != nil {
		return nil, false
	}
	return val, true
}

func (c *Cache) Set(key string, value []byte, ttl time.Duration) {
	if ttl <= 0 {
		ttl = c.ttl
	}
	exp := time.Now().Add(ttl).Unix()
	c.mu.Lock()
	defer c.mu.Unlock()
	_, _ = c.db.Exec("INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)", key, value, exp)
}

func (c *Cache) Close() error {
	return c.db.Close()
}

// Stats returns the number of entries and total size in bytes of cached data.
func (c *Cache) Stats() (entries int, sizeBytes int64) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_ = c.db.QueryRow("SELECT COUNT(*), COALESCE(SUM(LENGTH(value)), 0) FROM cache WHERE expires_at > ?", time.Now().Unix()).Scan(&entries, &sizeBytes)
	return entries, sizeBytes
}

func CacheKey(method, path, query string) string {
	return base64.URLEncoding.EncodeToString([]byte(method + " " + path + "?" + query))
}
