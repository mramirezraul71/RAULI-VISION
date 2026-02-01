package chat

import (
	"encoding/json"
	"strings"
	"sync"
	"time"
)

type Message struct {
	ID       string `json:"id"`
	Role     string `json:"role"`
	Content  string `json:"content"`
	Preview  string `json:"preview,omitempty"`
	TS       string `json:"ts"`
}

type Service struct {
	mu       sync.RWMutex
	messages []Message
}

func New() *Service {
	return &Service{messages: make([]Message, 0)}
}

func (s *Service) Chat(userMessage, contextURL string) (reply string, sources []string, err error) {
	reply = "Respuesta de ejemplo desde el espejo. "
	if contextURL != "" {
		reply += "Se solicitó resumir la URL: " + contextURL + ". En producción aquí se obtendría el contenido, se pasaría al LLM y se devolvería el resumen en texto plano."
		sources = []string{contextURL}
	} else {
		reply += "En producción la IA procesaría tu pregunta y devolvería una respuesta breve."
	}
	return reply, sources, nil
}

func (s *Service) AddToHistory(role, content string) {
	preview := content
	if len(preview) > 60 {
		preview = preview[:60] + "..."
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	id := "msg_" + time.Now().Format("20060102150405")
	s.messages = append(s.messages, Message{
		ID:      id,
		Role:    role,
		Content: content,
		Preview: preview,
		TS:      time.Now().UTC().Format(time.RFC3339),
	})
	if len(s.messages) > 100 {
		s.messages = s.messages[len(s.messages)-100:]
	}
}

func (s *Service) History(max int) []Message {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if max <= 0 {
		max = 20
	}
	start := len(s.messages) - max
	if start < 0 {
		start = 0
	}
	out := make([]Message, len(s.messages)-start)
	copy(out, s.messages[start:])
	return out
}

func (s *Service) ChatJSON(userMessage, contextURL string) ([]byte, error) {
	reply, sources, err := s.Chat(userMessage, contextURL)
	if err != nil {
		return nil, err
	}
	s.AddToHistory("user", userMessage)
	s.AddToHistory("assistant", reply)
	preview := reply
	if len(preview) > 80 {
		preview = preview[:80] + "..."
	}
	return json.Marshal(struct {
		Reply       string   `json:"reply"`
		SourcesUsed []string `json:"sources_used"`
	}{Reply: reply, SourcesUsed: sources})
}

func (s *Service) HistoryJSON(max int) ([]byte, error) {
	h := s.History(max)
	for i := range h {
		h[i].Content = ""
		h[i].Preview = strings.TrimSpace(h[i].Preview)
	}
	return json.Marshal(struct {
		Items []Message `json:"items"`
	}{Items: h})
}
