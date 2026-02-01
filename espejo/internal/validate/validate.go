package validate

import (
	"net/url"
	"regexp"
	"strings"
)

const (
	MaxQueryLen   = 500
	MaxMessageLen = 4000
	MaxURLLen     = 2048
)

var safeURLScheme = regexp.MustCompile(`^(https?|ftp):`)

func SearchQuery(q string) (string, bool) {
	q = strings.TrimSpace(q)
	if len(q) == 0 {
		return "", false
	}
	if len(q) > MaxQueryLen {
		q = q[:MaxQueryLen]
	}
	// Eliminar caracteres de control
	q = strings.Map(func(r rune) rune {
		if r < 32 && r != '\t' {
			return -1
		}
		return r
	}, q)
	return q, true
}

func ChatMessage(msg string) (string, bool) {
	msg = strings.TrimSpace(msg)
	if len(msg) == 0 {
		return "", false
	}
	if len(msg) > MaxMessageLen {
		msg = msg[:MaxMessageLen]
	}
	return msg, true
}

func ContextURL(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", true
	}
	if len(raw) > MaxURLLen {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", false
	}
	if !safeURLScheme.MatchString(u.Scheme) {
		return "", false
	}
	return raw, true
}

func VideoID(id string) (string, bool) {
	id = strings.TrimSpace(id)
	if id == "" || len(id) > 200 {
		return "", false
	}
	for _, r := range id {
		if r < 32 || r == '/' || r == '\\' {
			return "", false
		}
	}
	return id, true
}
