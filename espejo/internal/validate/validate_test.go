package validate

import (
	"testing"
)

func TestSearchQuery(t *testing.T) {
	tests := []struct {
		name   string
		q      string
		wantOK bool
		wantQ  string
	}{
		{"empty", "", false, ""},
		{"blank", "   ", false, ""},
		{"simple", "hello", true, "hello"},
		{"trimmed", "  world  ", true, "world"},
		{"max len truncate", string(make([]byte, MaxQueryLen+10)), true, ""}, // wantQ empty = only check len(got)==MaxQueryLen below
		{"control chars", "a\x00b\tc", true, "ab\tc"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := SearchQuery(tt.q)
			if ok != tt.wantOK {
				t.Errorf("SearchQuery(%q) ok = %v, want %v", tt.q, ok, tt.wantOK)
			}
			if ok && tt.wantQ != "" && got != tt.wantQ {
				t.Errorf("SearchQuery(%q) = %q, want %q", tt.q, got, tt.wantQ)
			}
			if ok && tt.name == "max len truncate" && len(got) != MaxQueryLen {
				t.Errorf("len(got) = %d, want %d", len(got), MaxQueryLen)
			}
		})
	}
}

func TestChatMessage(t *testing.T) {
	_, ok := ChatMessage("")
	if ok {
		t.Error("empty message should be invalid")
	}
	_, ok = ChatMessage("   ")
	if ok {
		t.Error("blank message should be invalid")
	}
	msg, ok := ChatMessage(" hello ")
	if !ok || msg != "hello" {
		t.Errorf("ChatMessage(' hello ') = %q, %v", msg, ok)
	}
}

func TestContextURL(t *testing.T) {
	_, ok := ContextURL("")
	if !ok {
		t.Error("empty URL should be valid (optional)")
	}
	_, ok = ContextURL("  ")
	if !ok {
		t.Error("blank URL should be valid (optional)")
	}
	u, ok := ContextURL("https://example.com")
	if !ok {
		t.Errorf("valid https URL: ok = false")
	}
	if u != "https://example.com" {
		t.Errorf("got %q", u)
	}
	_, ok = ContextURL("javascript:alert(1)")
	if ok {
		t.Error("javascript URL should be invalid")
	}
	_, ok = ContextURL("ftp://files.example.com")
	if !ok {
		t.Error("ftp URL should be valid")
	}
}

func TestVideoID(t *testing.T) {
	_, ok := VideoID("")
	if ok {
		t.Error("empty id should be invalid")
	}
	id, ok := VideoID("abc123")
	if !ok || id != "abc123" {
		t.Errorf("VideoID('abc123') = %q, %v", id, ok)
	}
	_, ok = VideoID("bad/id")
	if ok {
		t.Error("id with slash should be invalid")
	}
}
