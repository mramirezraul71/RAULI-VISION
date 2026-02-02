package chat

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
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
	mu              sync.RWMutex
	messages        []Message
	rauliCloudURL   string
	rauliCloudModel string
}

func New() *Service {
	url := strings.TrimSpace(os.Getenv("RAULI_CLOUD_URL"))
	model := strings.TrimSpace(os.Getenv("RAULI_CLOUD_MODEL"))
	if model == "" {
		model = "llama3.1"
	}
	return &Service{
		messages:        make([]Message, 0),
		rauliCloudURL:   url,
		rauliCloudModel: model,
	}
}

// sseEvent representa un evento "data: {...}" del streaming de RAULI-CLOUD.
type sseEvent struct {
	Content string `json:"content"`
	Done   bool   `json:"done"`
	Error  string `json:"error"`
}

func (s *Service) callRauliCloud(userMessage, contextURL string) (reply string, err error) {
	if s.rauliCloudURL == "" {
		return "", nil
	}
	prompt := userMessage
	if contextURL != "" {
		prompt = "Contexto (URL a resumir): " + contextURL + "\n\nPregunta del usuario: " + userMessage
	}
	body := map[string]string{
		"model":  s.rauliCloudModel,
		"prompt": prompt,
	}
	bodyJSON, _ := json.Marshal(body)
	req, err := http.NewRequest("POST", strings.TrimSuffix(s.rauliCloudURL, "/")+"/chat", strings.NewReader(string(bodyJSON)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", nil
	}
	var full strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var ev sseEvent
		if json.Unmarshal([]byte(line[6:]), &ev) != nil {
			continue
		}
		if ev.Error != "" {
			return "", nil
		}
		full.WriteString(ev.Content)
		if ev.Done {
			break
		}
	}
	return full.String(), nil
}

func (s *Service) Chat(userMessage, contextURL string) (reply string, sources []string, err error) {
	if s.rauliCloudURL != "" {
		reply, err = s.callRauliCloud(userMessage, contextURL)
		if err == nil && reply != "" {
			if contextURL != "" {
				sources = []string{contextURL}
			}
			return reply, sources, nil
		}
	}
	reply = "Respuesta de ejemplo desde el espejo. "
	if contextURL != "" {
		reply += "Se solicitó resumir la URL: " + contextURL + ". Configure RAULI_CLOUD_URL para usar IA local (Ollama)."
		sources = []string{contextURL}
	} else {
		reply += "Configure RAULI_CLOUD_URL=http://localhost:8000 para conectar con RAULI-CLOUD (Ollama)."
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
