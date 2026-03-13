package chat

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type Message struct {
	ID      string `json:"id"`
	Role    string `json:"role"`
	Content string `json:"content"`
	Preview string `json:"preview,omitempty"`
	TS      string `json:"ts"`
}

type RuntimeInfo struct {
	Provider  string `json:"provider,omitempty"`
	Family    string `json:"family,omitempty"`
	Model     string `json:"model,omitempty"`
	Route     string `json:"route,omitempty"`
	LatencyMS int    `json:"latency_ms,omitempty"`
	Offline   bool   `json:"offline,omitempty"`
}

type Service struct {
	mu              sync.RWMutex
	messages        []Message
	atlasBaseURL    string
	rauliCloudURL   string
	rauliCloudModel string
	geminiAPIKey    string
}

func New() *Service {
	atlasURL := strings.TrimSpace(os.Getenv("ATLAS_BASE_URL"))
	if atlasURL == "" {
		atlasURL = "http://127.0.0.1:8791"
	}
	url := strings.TrimSpace(os.Getenv("RAULI_CLOUD_URL"))
	model := strings.TrimSpace(os.Getenv("RAULI_CLOUD_MODEL"))
	if model == "" {
		model = "llama3.1"
	}
	return &Service{
		messages:        make([]Message, 0),
		atlasBaseURL:    strings.TrimRight(atlasURL, "/"),
		rauliCloudURL:   strings.TrimRight(url, "/"),
		rauliCloudModel: model,
		geminiAPIKey:    strings.TrimSpace(os.Getenv("GEMINI_API_KEY")),
	}
}

type sseEvent struct {
	Content string `json:"content"`
	Done    bool   `json:"done"`
	Error   string `json:"error"`
}

func fixMojibake(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" || !strings.ContainsAny(raw, "ÃÂâ") {
		return raw
	}
	buf := make([]byte, 0, len(raw))
	for _, r := range raw {
		if r > 255 {
			return raw
		}
		buf = append(buf, byte(r))
	}
	if !utf8.Valid(buf) {
		return raw
	}
	out := strings.TrimSpace(string(buf))
	if out == "" {
		return raw
	}
	return out
}

func parseRuntimeInfo(provider string, offline bool) RuntimeInfo {
	raw := strings.TrimSpace(provider)
	info := RuntimeInfo{
		Provider: raw,
		Family:   "unknown",
		Offline:  offline,
	}
	if raw == "" {
		return info
	}
	if strings.HasPrefix(raw, "local_auto:") {
		parts := strings.Split(raw, ":")
		if len(parts) >= 5 {
			info.Family = "local_auto"
			info.Model = strings.Join(parts[1:len(parts)-2], ":")
			info.Route = strings.ToUpper(strings.TrimSpace(parts[len(parts)-2]))
			latRaw := strings.TrimSuffix(parts[len(parts)-1], "ms")
			if n, err := strconv.Atoi(latRaw); err == nil {
				info.LatencyMS = n
			}
			return info
		}
	}
	for _, family := range []string{"bedrock", "openai"} {
		prefix := family + ":"
		if strings.HasPrefix(raw, prefix) {
			parts := strings.Split(raw, ":")
			if len(parts) >= 3 {
				info.Family = family
				info.Model = strings.Join(parts[1:len(parts)-1], ":")
				latRaw := strings.TrimSuffix(parts[len(parts)-1], "ms")
				if n, err := strconv.Atoi(latRaw); err == nil {
					info.LatencyMS = n
				}
				return info
			}
		}
	}
	if raw == "clawd_cli" {
		info.Family = "clawd_cli"
		info.Model = "subscription"
		return info
	}
	if strings.HasPrefix(raw, "clawd_api:") {
		info.Family = "clawd_api"
		return info
	}
	if strings.EqualFold(raw, "local_offline") {
		info.Family = "offline"
		info.Model = "fallback"
		info.Offline = true
	}
	return info
}

const geminiSystemPrompt = `Eres el asistente inteligente de RAULI VISION, una plataforma de entretenimiento digital cubana que ofrece búsqueda de videos, música, contenido de TikTok y chat asistido.

Tu rol es ayudar a los usuarios con preguntas sobre la plataforma, sobre los videos y contenidos que encuentran, sobre búsquedas, reproducción, y cualquier tema cultural o de entretenimiento. También puedes responder preguntas generales de cultura, historia, tecnología y actualidad.

IMPORTANTE:
- Responde siempre en español, de forma clara, amigable y concisa.
- NO mezcles información de inventarios, panadería, cámaras de seguridad ni sistemas operacionales.
- NO menciones "ATLAS", "panadería", "inventario" ni conceptos de sistemas industriales.
- Si el usuario pregunta por un video o contenido, ayúdalo a buscarlo o a entender cómo usar la plataforma.
- Si no sabes algo, dilo con honestidad y sugiere cómo el usuario podría encontrar la información.
- Mantén un tono cálido y accesible, como un asistente cultural digital.`

func (s *Service) callGemini(userMessage, contextURL string) (string, RuntimeInfo, error) {
	if s.geminiAPIKey == "" {
		return "", RuntimeInfo{}, nil
	}
	msg := userMessage
	if contextURL != "" {
		msg = "URL de contexto: " + contextURL + "\n\nPregunta: " + userMessage
	}
	reqBody := map[string]interface{}{
		"system_instruction": map[string]interface{}{
			"parts": []map[string]string{{"text": geminiSystemPrompt}},
		},
		"contents": []map[string]interface{}{
			{"role": "user", "parts": []map[string]string{{"text": msg}}},
		},
		"generationConfig": map[string]interface{}{
			"temperature":     0.7,
			"maxOutputTokens": 1024,
		},
	}
	bodyJSON, err := json.Marshal(reqBody)
	if err != nil {
		return "", RuntimeInfo{}, err
	}
	apiURL := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s",
		s.geminiAPIKey,
	)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyJSON))
	if err != nil {
		return "", RuntimeInfo{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", RuntimeInfo{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", RuntimeInfo{}, nil
	}
	var gemResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gemResp); err != nil {
		return "", RuntimeInfo{}, err
	}
	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return "", RuntimeInfo{}, nil
	}
	text := strings.TrimSpace(gemResp.Candidates[0].Content.Parts[0].Text)
	return text, RuntimeInfo{
		Provider: "gemini",
		Family:   "gemini",
		Model:    "gemini-2.5-flash",
	}, nil
}

func (s *Service) callAtlas(userMessage, contextURL string) (string, RuntimeInfo, error) {
	if s.atlasBaseURL == "" {
		return "", RuntimeInfo{}, nil
	}
	payload := map[string]interface{}{
		"user_id": "rauli-vision-web",
		"channel": "rauli-vision",
		"message": userMessage,
		"context": map[string]interface{}{
			"source":      "rauli-vision",
			"source_app":  "rauli-vision",
			"context_url": contextURL,
		},
	}
	bodyJSON, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", s.atlasBaseURL+"/api/comms/atlas/message", strings.NewReader(string(bodyJSON)))
	if err != nil {
		return "", RuntimeInfo{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", RuntimeInfo{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", RuntimeInfo{}, nil
	}
	var data struct {
		Response string `json:"response"`
		Reply    string `json:"reply"`
		Provider string `json:"provider"`
		Offline  bool   `json:"offline_mode"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", RuntimeInfo{}, err
	}
	out := strings.TrimSpace(data.Response)
	if out == "" {
		out = strings.TrimSpace(data.Reply)
	}
	return fixMojibake(out), parseRuntimeInfo(data.Provider, data.Offline), nil
}

func (s *Service) callRauliCloud(userMessage, contextURL string) (string, RuntimeInfo, error) {
	if s.rauliCloudURL == "" {
		return "", RuntimeInfo{}, nil
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
	req, err := http.NewRequest("POST", s.rauliCloudURL+"/chat", strings.NewReader(string(bodyJSON)))
	if err != nil {
		return "", RuntimeInfo{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", RuntimeInfo{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", RuntimeInfo{}, nil
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
			return "", RuntimeInfo{}, nil
		}
		full.WriteString(ev.Content)
		if ev.Done {
			break
		}
	}
	return fixMojibake(full.String()), RuntimeInfo{
		Provider: "rauli_cloud",
		Family:   "rauli_cloud",
		Model:    s.rauliCloudModel,
	}, nil
}

func (s *Service) Chat(userMessage, contextURL string) (reply string, sources []string, runtime RuntimeInfo, err error) {
	// 1. Gemini directo — contexto RAULI-VISION puro, sin contaminación operacional
	if s.geminiAPIKey != "" {
		reply, runtime, err = s.callGemini(userMessage, contextURL)
		if err == nil && strings.TrimSpace(reply) != "" {
			if contextURL != "" {
				sources = []string{contextURL}
			}
			return reply, sources, runtime, nil
		}
	}

	// 2. RAULI-Cloud (Ollama local)
	if s.rauliCloudURL != "" {
		reply, runtime, err = s.callRauliCloud(userMessage, contextURL)
		if err == nil && strings.TrimSpace(reply) != "" {
			if contextURL != "" {
				sources = []string{contextURL}
			}
			return reply, sources, runtime, nil
		}
	}

	// 3. ATLAS comms hub (último recurso)
	reply, runtime, err = s.callAtlas(userMessage, contextURL)
	if err == nil && strings.TrimSpace(reply) != "" {
		if contextURL != "" {
			sources = []string{contextURL}
		}
		return reply, sources, runtime, nil
	}

	reply = "Estoy operando en modo local de RAULI-VISION. "
	if contextURL != "" {
		reply += "Puedo trabajar con la URL indicada y sincronizar con ATLAS cuando el enlace remoto responda: " + contextURL + "."
		sources = []string{contextURL}
	} else {
		reply += "Si necesitas una respuesta mas profunda, la reenviare a ATLAS apenas el servicio remoto vuelva a responder."
	}
	runtime = RuntimeInfo{Provider: "local_offline", Family: "offline", Model: "fallback", Offline: true}
	return reply, sources, runtime, nil
}

func (s *Service) AddToHistory(role, content string) {
	content = fixMojibake(content)
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
	reply, sources, runtime, err := s.Chat(userMessage, contextURL)
	if err != nil {
		return nil, err
	}
	s.AddToHistory("user", userMessage)
	s.AddToHistory("assistant", reply)
	return json.Marshal(struct {
		Reply       string      `json:"reply"`
		SourcesUsed []string    `json:"sources_used"`
		Runtime     RuntimeInfo `json:"runtime"`
	}{Reply: reply, SourcesUsed: sources, Runtime: runtime})
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
