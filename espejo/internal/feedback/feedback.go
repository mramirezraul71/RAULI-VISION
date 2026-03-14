package feedback

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// FeedbackRequest es la estructura plana que envía el frontend.
type FeedbackRequest struct {
	Type        string                 `json:"type"`
	Severity    string                 `json:"severity"`
	Title       string                 `json:"title"`
	Description string                 `json:"description"`
	Screenshot  string                 `json:"screenshot,omitempty"`
	SystemInfo  map[string]interface{} `json:"systemInfo,omitempty"`
}

// FeedbackResponse es la respuesta que espera el frontend.
type FeedbackResponse struct {
	OK               bool   `json:"ok"`
	Analysis         string `json:"analysis,omitempty"`
	EstimatedFixTime string `json:"estimated_fix_time,omitempty"`
	AutoFix          bool   `json:"auto_fix"`
}

// EscalationRecord se escribe en disco cuando se detecta un problema de código.
type EscalationRecord struct {
	ID          string                 `json:"id"`
	Timestamp   string                 `json:"timestamp"`
	Type        string                 `json:"type"`
	Severity    string                 `json:"severity"`
	Title       string                 `json:"title"`
	Description string                 `json:"description"`
	Analysis    string                 `json:"analysis"`
	SystemInfo  map[string]interface{} `json:"system_info,omitempty"`
	Status      string                 `json:"status"`
}

type Service struct {
	geminiAPIKey string
	atlasBaseURL string
	escalationDir string
}

func New() *Service {
	dir := os.Getenv("FEEDBACK_ESCALATION_DIR")
	if dir == "" {
		dir = "data/feedback-escalations"
	}
	_ = os.MkdirAll(dir, 0755)
	return &Service{
		geminiAPIKey:  strings.TrimSpace(os.Getenv("GEMINI_API_KEY")),
		atlasBaseURL:  strings.TrimRight(strings.TrimSpace(os.Getenv("ATLAS_BASE_URL")), "/"),
		escalationDir: dir,
	}
}

// ProcessFeedback es el handler principal del módulo Feedback AI.
func (s *Service) ProcessFeedback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req FeedbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, FeedbackResponse{OK: false, Analysis: "Solicitud inválida."})
		return
	}
	if strings.TrimSpace(req.Title) == "" || strings.TrimSpace(req.Description) == "" {
		writeJSON(w, http.StatusBadRequest, FeedbackResponse{OK: false, Analysis: "Título y descripción son requeridos."})
		return
	}

	log.Printf("📬 Feedback recibido [%s/%s]: %s", req.Type, req.Severity, req.Title)

	// Gemini como IA primaria de atención
	resp, err := s.analyzeWithGemini(req)
	if err != nil || !resp.OK {
		log.Printf("⚠️ Gemini no disponible, usando análisis local: %v", err)
		resp = s.localFallbackAnalysis(req)
	}

	// Escalación automática si requiere corrección de código o severidad alta/crítica
	needsEscalation := !resp.AutoFix && (req.Severity == "critical" || req.Severity == "high" || req.Type == "bug" || req.Type == "error")
	if needsEscalation {
		go s.escalate(req, resp.Analysis)
	}

	writeJSON(w, http.StatusOK, resp)
}

// analyzeWithGemini usa Gemini Flash como IA primaria para analizar el feedback.
func (s *Service) analyzeWithGemini(req FeedbackRequest) (FeedbackResponse, error) {
	if s.geminiAPIKey == "" {
		return FeedbackResponse{}, fmt.Errorf("GEMINI_API_KEY no configurado")
	}

	systemPrompt := `Eres el analizador de feedback de RAULI VISION, una plataforma de entretenimiento digital.
Tu tarea es analizar el feedback del usuario y determinar:
1. Una respuesta clara y útil para el usuario (max 3 oraciones, en español)
2. Tiempo estimado de resolución
3. Si el problema puede resolverse automáticamente sin intervención de código

Responde SIEMPRE en este JSON exacto (sin markdown, sin texto extra):
{
  "analysis": "Respuesta clara para el usuario...",
  "estimated_fix_time": "X minutos/horas/días",
  "auto_fix": true/false
}

Criterios para auto_fix:
- true: problemas de configuración, caché, reload, permisos de usuario
- false: bugs de código, errores de estructura, problemas de backend, crashes`

	userMsg := fmt.Sprintf("Tipo: %s\nSeveridad: %s\nTítulo: %s\nDescripción: %s",
		req.Type, req.Severity, req.Title, req.Description)
	if sysInfo, ok := req.SystemInfo["url"].(string); ok && sysInfo != "" {
		userMsg += "\nURL del problema: " + sysInfo
	}

	reqBody := map[string]interface{}{
		"system_instruction": map[string]interface{}{
			"parts": []map[string]string{{"text": systemPrompt}},
		},
		"contents": []map[string]interface{}{
			{"role": "user", "parts": []map[string]string{{"text": userMsg}}},
		},
		"generationConfig": map[string]interface{}{
			"temperature":      0.3,
			"maxOutputTokens":  1024,
			"thinkingConfig":   map[string]interface{}{"thinkingBudget": 0},
		},
	}
	bodyJSON, err := json.Marshal(reqBody)
	if err != nil {
		return FeedbackResponse{}, err
	}

	apiURL := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s",
		s.geminiAPIKey,
	)
	httpReq, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyJSON))
	if err != nil {
		return FeedbackResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 25 * time.Second}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		return FeedbackResponse{}, err
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		return FeedbackResponse{}, fmt.Errorf("gemini status=%d", httpResp.StatusCode)
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
	if err := json.NewDecoder(httpResp.Body).Decode(&gemResp); err != nil {
		return FeedbackResponse{}, err
	}
	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return FeedbackResponse{}, fmt.Errorf("gemini: respuesta vacía")
	}

	raw := strings.TrimSpace(gemResp.Candidates[0].Content.Parts[0].Text)

	// Extraer bloque JSON: buscar primer '{' y último '}'
	jsonRaw := raw
	if start := strings.Index(raw, "{"); start >= 0 {
		if end := strings.LastIndex(raw, "}"); end > start {
			jsonRaw = raw[start : end+1]
		}
	}

	var parsed struct {
		Analysis         string `json:"analysis"`
		EstimatedFixTime string `json:"estimated_fix_time"`
		AutoFix          bool   `json:"auto_fix"`
	}
	if err := json.Unmarshal([]byte(jsonRaw), &parsed); err != nil {
		log.Printf("⚠️ Gemini JSON no parseable: %v | raw[:150]=%s", err, raw[:min(len(raw), 150)])
		// Usar el texto completo como análisis libre
		return FeedbackResponse{
			OK:               true,
			Analysis:         raw,
			EstimatedFixTime: "Pendiente de evaluación",
			AutoFix:          false,
		}, nil
	}

	if strings.TrimSpace(parsed.Analysis) == "" {
		return FeedbackResponse{}, fmt.Errorf("gemini: análisis vacío")
	}

	log.Printf("✅ Gemini analizó feedback [auto_fix=%v]: %s", parsed.AutoFix, parsed.Analysis[:min(len(parsed.Analysis), 80)])
	return FeedbackResponse{
		OK:               true,
		Analysis:         parsed.Analysis,
		EstimatedFixTime: parsed.EstimatedFixTime,
		AutoFix:          parsed.AutoFix,
	}, nil
}

// localFallbackAnalysis genera una respuesta local cuando Gemini no está disponible.
func (s *Service) localFallbackAnalysis(req FeedbackRequest) FeedbackResponse {
	var analysis string
	var fixTime string
	autoFix := false

	switch req.Severity {
	case "critical":
		analysis = "Tu reporte crítico ha sido recibido y registrado con máxima prioridad. El equipo lo revisará de inmediato."
		fixTime = "< 2 horas"
	case "high":
		analysis = "Reporte registrado con prioridad alta. Revisaremos el problema y te mantendremos informado."
		fixTime = "2-4 horas"
	default:
		switch req.Type {
		case "suggestion", "improvement":
			analysis = "Gracias por tu sugerencia. La hemos anotado para considerarla en próximas actualizaciones."
			fixTime = "Próxima versión"
			autoFix = false
		default:
			analysis = "Tu reporte ha sido recibido y está siendo procesado. Te notificaremos cuando esté resuelto."
			fixTime = "24 horas"
		}
	}

	return FeedbackResponse{
		OK:               true,
		Analysis:         analysis,
		EstimatedFixTime: fixTime,
		AutoFix:          autoFix,
	}
}

// escalate registra en disco y notifica a ATLAS cuando se detecta un problema que requiere corrección.
func (s *Service) escalate(req FeedbackRequest, analysis string) {
	id := fmt.Sprintf("esc_%d", time.Now().UnixNano())
	record := EscalationRecord{
		ID:          id,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		Type:        req.Type,
		Severity:    req.Severity,
		Title:       req.Title,
		Description: req.Description,
		Analysis:    analysis,
		SystemInfo:  req.SystemInfo,
		Status:      "pending_specialist_review",
	}

	// Escribir en disco para revisión posterior
	fname := filepath.Join(s.escalationDir, id+".json")
	if data, err := json.MarshalIndent(record, "", "  "); err == nil {
		if err := os.WriteFile(fname, data, 0644); err == nil {
			log.Printf("📁 Escalación guardada: %s", fname)
		}
	}

	// Notificar a ATLAS si está disponible (sin bloquear)
	base := strings.TrimSpace(s.atlasBaseURL)
	if base == "" {
		base = "http://127.0.0.1:8791"
	}
	msg := fmt.Sprintf("[RAULI-VISION ESCALATION] Feedback requiere revisión especialista. ID: %s | Severidad: %s | Título: %s | Descripción: %s | Análisis Gemini: %s",
		id, req.Severity, req.Title, req.Description, analysis)

	body := map[string]interface{}{
		"user_id": "vision:feedback-bot",
		"channel": "vision-escalations",
		"message": msg,
		"context": map[string]interface{}{
			"source":        "rauli-vision-feedback",
			"escalation_id": id,
			"type":          req.Type,
			"severity":      req.Severity,
			"auto_fix":      false,
			"action":        "specialist_review_required",
		},
	}
	payload, _ := json.Marshal(body)
	httpReq, err := http.NewRequest("POST", base+"/api/comms/atlas/message", bytes.NewReader(payload))
	if err != nil {
		log.Printf("⚠️ Escalación ATLAS: no se pudo crear request: %v", err)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("⚠️ Escalación ATLAS: no disponible (guardado en disco): %v", err)
		return
	}
	defer resp.Body.Close()
	log.Printf("📡 Escalación notificada a ATLAS [status=%d]: %s", resp.StatusCode, id)
}

// HandleFeedbackStats devuelve estadísticas del directorio de escalaciones.
func (s *Service) HandleFeedbackStats(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(s.escalationDir)
	total := 0
	pending := 0
	if err == nil {
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".json") {
				total++
				// Leer status del archivo
				data, readErr := os.ReadFile(filepath.Join(s.escalationDir, e.Name()))
				if readErr == nil {
					var rec EscalationRecord
					if json.Unmarshal(data, &rec) == nil && rec.Status == "pending_specialist_review" {
						pending++
					}
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":              true,
		"total":           total,
		"pending_review":  pending,
		"gemini_enabled":  s.geminiAPIKey != "",
		"atlas_connected": s.atlasBaseURL != "",
		"last_update":     time.Now().Format(time.RFC3339),
	})
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
