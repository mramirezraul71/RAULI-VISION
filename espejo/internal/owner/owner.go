// Package owner implementa el panel de control del Owner:
// - Bus de eventos en tiempo real (SSE) con actividad de usuarios
// - Canal de tareas directo Owner → Gemini
package owner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ActivityEvent representa un evento de actividad de usuario.
type ActivityEvent struct {
	ID        string                 `json:"id"`
	Timestamp string                 `json:"timestamp"`
	Type      string                 `json:"type"`    // "feedback" | "chat" | "search" | "tiktok" | "radio" | "tv"
	UserID    string                 `json:"user_id"` // identificador o "anónimo"
	Summary   string                 `json:"summary"` // resumen breve visible al owner
	Details   map[string]interface{} `json:"details,omitempty"`
	Severity  string                 `json:"severity,omitempty"` // para feedback
}

// TaskRequest es la solicitud de tarea del Owner.
type TaskRequest struct {
	Task    string `json:"task"`
	Context string `json:"context,omitempty"`
}

// TaskResponse es la respuesta de Gemini al Owner.
type TaskResponse struct {
	OK       bool   `json:"ok"`
	Reply    string `json:"reply"`
	Model    string `json:"model"`
	Duration int    `json:"duration_ms"`
}

// subscriber representa un cliente SSE conectado.
type subscriber struct {
	ch     chan ActivityEvent
	done   chan struct{}
}

// Service gestiona el bus de eventos y el canal de tareas.
type Service struct {
	mu           sync.RWMutex
	subscribers  map[string]*subscriber
	recentEvents []ActivityEvent // buffer de últimos 50 eventos
	geminiKey    string
	adminToken   string
}

var global *Service
var once sync.Once

// Init inicializa el servicio global de Owner.
func Init(adminToken, geminiKey string) *Service {
	once.Do(func() {
		global = &Service{
			subscribers:  make(map[string]*subscriber),
			recentEvents: make([]ActivityEvent, 0, 50),
			geminiKey:    strings.TrimSpace(geminiKey),
			adminToken:   strings.TrimSpace(adminToken),
		}
	})
	return global
}

// Get devuelve el servicio global (puede ser nil si no se inicializó).
func Get() *Service { return global }

// Emit registra un evento de actividad y lo distribuye a todos los suscriptores.
// Llamar desde cualquier módulo: owner.Emit(...)
func Emit(evType, userID, summary string, details map[string]interface{}, severity ...string) {
	svc := Get()
	if svc == nil {
		return
	}
	sev := ""
	if len(severity) > 0 {
		sev = severity[0]
	}
	ev := ActivityEvent{
		ID:        fmt.Sprintf("ev_%d", time.Now().UnixNano()),
		Timestamp: time.Now().Format(time.RFC3339),
		Type:      evType,
		UserID:    userID,
		Summary:   summary,
		Details:   details,
		Severity:  sev,
	}
	svc.mu.Lock()
	svc.recentEvents = append(svc.recentEvents, ev)
	if len(svc.recentEvents) > 50 {
		svc.recentEvents = svc.recentEvents[len(svc.recentEvents)-50:]
	}
	// Distribuir a suscriptores activos
	for _, sub := range svc.subscribers {
		select {
		case sub.ch <- ev:
		default:
			// Canal lleno — descartar para no bloquear
		}
	}
	svc.mu.Unlock()
}

// ServeActivity es el handler SSE para el monitor del Owner.
func (s *Service) ServeActivity(w http.ResponseWriter, r *http.Request) {
	// Verificar admin token
	if !s.checkToken(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Verificar que el cliente acepta SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming_not_supported"})
		return
	}

	// Registrar suscriptor
	sub := &subscriber{
		ch:   make(chan ActivityEvent, 20),
		done: make(chan struct{}),
	}
	subID := fmt.Sprintf("owner_%d", time.Now().UnixNano())

	s.mu.Lock()
	s.subscribers[subID] = sub
	// Enviar eventos recientes como "replay"
	recent := make([]ActivityEvent, len(s.recentEvents))
	copy(recent, s.recentEvents)
	s.mu.Unlock()

	// Replay de eventos recientes
	for _, ev := range recent {
		writeSSEEvent(w, "activity", ev)
	}
	flusher.Flush()

	log.Printf("👁️ Owner conectado al monitor de actividad [%s]", subID)

	// Heartbeat cada 25s
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	defer func() {
		s.mu.Lock()
		delete(s.subscribers, subID)
		s.mu.Unlock()
		log.Printf("👁️ Owner desconectado del monitor [%s]", subID)
	}()

	for {
		select {
		case ev := <-sub.ch:
			writeSSEEvent(w, "activity", ev)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

// ServeTask procesa una tarea del Owner via Gemini.
func (s *Service) ServeTask(w http.ResponseWriter, r *http.Request) {
	if !s.checkToken(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var req TaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Task) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "task_required"})
		return
	}

	start := time.Now()
	reply, err := s.callGeminiTask(req.Task, req.Context)
	dur := int(time.Since(start).Milliseconds())

	if err != nil {
		log.Printf("⚠️ Owner task Gemini error: %v", err)
		writeJSON(w, http.StatusOK, TaskResponse{
			OK:       false,
			Reply:    "Gemini no disponible en este momento. Intenta de nuevo.",
			Model:    "fallback",
			Duration: dur,
		})
		return
	}

	// Emitir como evento de actividad del owner
	Emit("owner_task", "owner", "Tarea: "+req.Task[:min(len(req.Task), 60)], map[string]interface{}{
		"task":  req.Task,
		"reply": reply[:min(len(reply), 120)],
	})

	writeJSON(w, http.StatusOK, TaskResponse{
		OK:       true,
		Reply:    reply,
		Model:    "gemini-2.5-flash",
		Duration: dur,
	})
}

// ServeRecent devuelve los últimos eventos de actividad (REST fallback).
func (s *Service) ServeRecent(w http.ResponseWriter, r *http.Request) {
	if !s.checkToken(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	s.mu.RLock()
	events := make([]ActivityEvent, len(s.recentEvents))
	copy(events, s.recentEvents)
	s.mu.RUnlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":     true,
		"events": events,
		"count":  len(events),
	})
}

func (s *Service) checkToken(r *http.Request) bool {
	if s.adminToken == "" {
		log.Printf("🔑 checkToken: ADMIN_TOKEN no configurado")
		return false
	}
	token := strings.TrimSpace(r.Header.Get("X-Admin-Token"))
	source := "header"
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
		source = "query"
	}
	if strings.HasPrefix(strings.ToLower(token), "bearer ") {
		token = strings.TrimSpace(token[7:])
	}
	match := token == s.adminToken
	if !match {
		log.Printf("🔑 checkToken FAIL via %s: recibido_len=%d stored_len=%d recibido_prefix=%q stored_prefix=%q",
			source, len(token), len(s.adminToken),
			safePrefix(token, 4), safePrefix(s.adminToken, 4))
	}
	return match
}

func safePrefix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

const ownerSystemPrompt = `Eres el asistente de control del Owner de RAULI-VISION, una plataforma de entretenimiento digital.
El Owner es el administrador y propietario del sistema.

Tu rol: ejecutar las tareas que te indique el Owner de forma directa, técnica y eficiente.
Puedes ayudar con: análisis de problemas del sistema, redacción de respuestas, diagnóstico de errores, configuración, estrategias, etc.

Responde siempre en español, de forma concisa y directa. Si la tarea requiere código, inclúyelo.`

func (s *Service) callGeminiTask(task, context string) (string, error) {
	if s.geminiKey == "" {
		return "", fmt.Errorf("GEMINI_API_KEY no configurado")
	}
	msg := task
	if context != "" {
		msg = "Contexto del sistema: " + context + "\n\nTarea: " + task
	}
	reqBody := map[string]interface{}{
		"system_instruction": map[string]interface{}{
			"parts": []map[string]string{{"text": ownerSystemPrompt}},
		},
		"contents": []map[string]interface{}{
			{"role": "user", "parts": []map[string]string{{"text": msg}}},
		},
		"generationConfig": map[string]interface{}{
			"temperature":    0.5,
			"maxOutputTokens": 2048,
			"thinkingConfig":  map[string]interface{}{"thinkingBudget": 0},
		},
	}
	bodyJSON, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}
	apiURL := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s",
		s.geminiKey,
	)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyJSON))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gemini status=%d", resp.StatusCode)
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
		return "", err
	}
	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("gemini: respuesta vacía")
	}
	return strings.TrimSpace(gemResp.Candidates[0].Content.Parts[0].Text), nil
}

func writeSSEEvent(w http.ResponseWriter, event string, data interface{}) {
	b, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, string(b))
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// EmitFromEnv emite un evento usando la clave de Gemini del entorno.
// Conveniencia para llamar desde main.go sin importar el paquete completo.
func EmitFromEnv(evType, userID, summary string, details map[string]interface{}) {
	_ = os.Getenv // suprime warning de import no usado
	Emit(evType, userID, summary, details)
}
