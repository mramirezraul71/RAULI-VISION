//go:build !cgo
// +build !cgo

package cache

import (
	"encoding/base64"
	"sync"
	"time"
)

type Cache struct {
	mu  sync.RWMutex
	ttl time.Duration
	data map[string]cacheEntry
}

type cacheEntry struct {
	value     []byte
	expiresAt time.Time
}

func New(_ string) (*Cache, error) {
	return &Cache{ttl: 24 * time.Hour, data: make(map[string]cacheEntry)}, nil
}

func (c *Cache) Get(key string) ([]byte, bool) {
	c.mu.RLock()
	entry, ok := c.data[key]
	c.mu.RUnlock()
	if !ok {
		return nil, false
	}
	if time.Now().After(entry.expiresAt) {
		c.mu.Lock()
		delete(c.data, key)
		c.mu.Unlock()
		return nil, false
	}
	return entry.value, true
}

func (c *Cache) Set(key string, value []byte, ttl time.Duration) {
	if ttl <= 0 {
		ttl = c.ttl
	}
	exp := time.Now().Add(ttl)
	c.mu.Lock()
	c.data[key] = cacheEntry{value: value, expiresAt: exp}
	c.mu.Unlock()
}

func (c *Cache) Close() error {
	return nil
}

func (c *Cache) Stats() (entries int, sizeBytes int64) {
	now := time.Now()
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, entry := range c.data {
		if now.After(entry.expiresAt) {
			continue
		}
		entries++
		sizeBytes += int64(len(entry.value))
	}
	return entries, sizeBytes
}

func CacheKey(method, path, query string) string {
	return base64.URLEncoding.EncodeToString([]byte(method + " " + path + "?" + query))
}
