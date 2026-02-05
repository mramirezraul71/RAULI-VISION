package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"os/exec"
)

// CascadeBot - Bot especializado para comunicación con Cascade
type CascadeBot struct {
	config     *Config
	httpClient *http.Client
	audioMgr   *AudioManager
	sttEngine  *STTEngine
	ttsEngine  *TTSEngine
	systemTTS  *SystemTTS
	conversations map[int64]*CascadeConversation
	mu         sync.RWMutex
	ctx        context.Context
	cancel     context.CancelFunc
	isActive   bool
}

// CascadeConversation - Conversación especial con Cascade
type CascadeConversation struct {
	UserID       int64
	Username     string
	FirstName    string
	LastMessage  time.Time
	Context      []string
	SessionID    string
	IsActive     bool
	Language     string
	VoiceProfile string
	Messages     []MessageLog
}

// MessageLog - Registro de mensajes
type MessageLog struct {
	Timestamp time.Time
	Type      string // "user_voice", "user_text", "cascade_voice", "cascade_text"
	Content   string
	Duration  int // para mensajes de voz
}

// Configuración específica para Cascade
type CascadeConfig struct {
	Token         string `json:"token"`
	WebhookURL    string `json:"webhook_url"`
	AudioDir      string `json:"audio_dir"`
	TempDir       string `json:"temp_dir"`
	MaxFileSize   int64  `json:"max_file_size"`
	CascadeAPIKey string `json:"cascade_api_key"`
	VoiceEnabled  bool   `json:"voice_enabled"`
	AlwaysAudio   bool   `json:"always_audio"` // Responder siempre con audio
}

// Nuevo CascadeBot
func NewCascadeBot(config *CascadeConfig) *CascadeBot {
	ctx, cancel := context.WithCancel(context.Background())
	
	bot := &CascadeBot{
		config:        (*Config)(config),
		httpClient:    &http.Client{Timeout: 30 * time.Second},
		audioMgr:      NewAudioManager(config.AudioDir, config.TempDir),
		sttEngine:     NewSTTEngine(),
		ttsEngine:     NewTTSEngine(),
		systemTTS:     NewSystemTTS(),
		conversations: make(map[int64]*CascadeConversation),
		ctx:           ctx,
		cancel:        cancel,
		isActive:      true,
	}
	
	// Crear directorios
	os.MkdirAll(config.AudioDir, 0755)
	os.MkdirAll(config.TempDir, 0755)
	
	return bot
}

// Iniciar CascadeBot
func (cb *CascadeBot) Start() error {
	log.Println("🤖 Iniciando CascadeBot - Comunicación directa con Cascade...")
	
	// Configurar webhook si es necesario
	if cb.config.WebhookURL != "" {
		if err := cb.setWebhook(); err != nil {
			return fmt.Errorf("error configurando webhook: %w", err)
		}
	}
	
	// Iniciar procesamiento permanente
	go cb.processUpdates()
	go cb.maintainConnections()
	
	log.Println("✅ CascadeBot iniciado - Lista para comunicarse con Cascade")
	return nil
}

// Mantener conexiones activas
func (cb *CascadeBot) maintainConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-cb.ctx.Done():
			return
		case <-ticker.C:
			cb.checkInactiveConversations()
		}
	}
}

// Verificar conversaciones inactivas
func (cb *CascadeBot) checkInactiveConversations() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	now := time.Now()
	for userID, conv := range cb.conversations {
		// Si no hay mensajes en 1 hora, marcar como inactiva
		if now.Sub(conv.LastMessage) > time.Hour {
			conv.IsActive = false
			log.Printf("📊 Conversación con %s marcada como inactiva", conv.FirstName)
		}
	}
}

// Procesar actualizaciones
func (cb *CascadeBot) processUpdates() {
	ticker := time.NewTicker(500 * time.Millisecond) // Más frecuente para comunicación en tiempo real
	defer ticker.Stop()
	
	offset := 0
	
	for {
		select {
		case <-cb.ctx.Done():
			return
		case <-ticker.C:
			updates, err := cb.getUpdates(offset, 100)
			if err != nil {
				log.Printf("❌ Error obteniendo actualizaciones: %v", err)
				continue
			}
			
			for _, update := range updates {
				cb.handleUpdate(update)
				offset = update.UpdateID + 1
			}
		}
	}
}

// Manejar actualización
func (cb *CascadeBot) handleUpdate(update Update) {
	if update.Message == nil {
		return
	}
	
	msg := update.Message
	user := msg.From
	chat := msg.Chat
	
	// Obtener o crear conversación
	conv := cb.getOrCreateConversation(user.ID, user)
	
	// Actualizar actividad
	conv.LastMessage = time.Now()
	if !conv.IsActive {
		conv.IsActive = true
		log.Printf("🔄 Conversación reactivada con %s", conv.FirstName)
	}
	
	// Procesar mensaje
	if msg.Voice != nil {
		cb.handleUserVoice(chat.ID, msg.Voice, conv)
	} else if msg.Audio != nil {
		cb.handleUserAudio(chat.ID, msg.Audio, conv)
	} else if msg.Text != "" {
		cb.handleUserText(chat.ID, msg.Text, conv)
	}
}

// Obtener o crear conversación
func (cb *CascadeBot) getOrCreateConversation(userID int64, user *User) *CascadeConversation {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	conv, exists := cb.conversations[userID]
	if !exists {
		conv = &CascadeConversation{
			UserID:       userID,
			Username:     user.Username,
			FirstName:    user.FirstName,
			LastMessage:  time.Now(),
			Context:      make([]string, 0, 20),
			SessionID:    uuid.New().String()[:8],
			IsActive:     true,
			Language:     user.Language,
			VoiceProfile: "cascade_default",
			Messages:     make([]MessageLog, 0, 100),
		}
		cb.conversations[userID] = conv
		
		// Mensaje de bienvenida personalizado
		go cb.sendCascadeWelcome(userID)
	}
	
	return conv
}

// Enviar mensaje de bienvenida de Cascade
func (cb *CascadeBot) sendCascadeWelcome(userID int64) {
	welcome := `🎉 ¡Hola! Soy Cascade, tu asistente de IA.

🎤 **Comunicación Natural:**
• Envíame mensajes de voz y te responderé con mi voz
• También puedes escribirme y te responderé con audio
• Comunicación 100% permanente y fluida

🤖 **Mis Capacidades:**
• Programación y desarrollo
• Análisis de código
• Resolución de problemas
• Asistencia técnica

💬 **Comienza cuando quieras:**
"Hola Cascade, necesito ayuda con..."
"Cascade, ¿puedes ayudarme a...?"

¡Estoy lista para ayudarte! 🚀`
	
	cb.sendTextMessage(userID, welcome)
}

// Manejar mensaje de voz del usuario
func (cb *CascadeBot) handleUserVoice(chatID int64, voice *Voice, conv *CascadeConversation) {
	log.Printf("🎤 Mensaje de voz de %s (duración: %ds)", conv.FirstName, voice.Duration)
	
	// Registrar mensaje
	msgLog := MessageLog{
		Timestamp: time.Now(),
		Type:      "user_voice",
		Duration:  voice.Duration,
	}
	conv.Messages = append(conv.Messages, msgLog)
	
	// Descargar audio
	audioPath, err := cb.downloadAudio(voice.FileID)
	if err != nil {
		log.Printf("❌ Error descargando audio: %v", err)
		cb.sendErrorMessage(chatID, "No pude procesar tu mensaje de voz. Intenta de nuevo.")
		return
	}
	defer os.Remove(audioPath)
	
	// Convertir a texto
	text, err := cb.sttEngine.SpeechToText(audioPath, conv.Language)
	if err != nil {
		log.Printf("❌ Error en speech-to-text: %v", err)
		cb.sendErrorMessage(chatID, "No pude entender tu mensaje de voz. ¿Puedes repetirlo o escribirlo?")
		return
	}
	
	log.Printf("📝 Usuario dijo: %s", text)
	
	// Actualizar registro
	msgLog.Content = text
	
	// Agregar al contexto
	conv.Context = append(conv.Context, fmt.Sprintf("Usuario: %s", text))
	if len(conv.Context) > 20 {
		conv.Context = conv.Context[1:]
	}
	
	// Procesar con Cascade y responder
	go cb.processAndRespond(chatID, text, conv)
}

// Manejar mensaje de audio del usuario
func (cb *CascadeBot) handleUserAudio(chatID int64, audio *Audio, conv *CascadeConversation) {
	log.Printf("🎵 Mensaje de audio de %s: %s", conv.FirstName, audio.Title)
	
	voice := &Voice{
		FileID:   audio.FileID,
		Duration: audio.Duration,
		MimeType: audio.MimeType,
		FileSize: audio.FileSize,
	}
	
	cb.handleUserVoice(chatID, voice, conv)
}

// Manejar mensaje de texto del usuario
func (cb *CascadeBot) handleUserText(chatID int64, text string, conv *CascadeConversation) {
	log.Printf("💬 Mensaje de texto de %s: %s", conv.FirstName, text)
	
	// Registrar mensaje
	msgLog := MessageLog{
		Timestamp: time.Now(),
		Type:      "user_text",
		Content:   text,
	}
	conv.Messages = append(conv.Messages, msgLog)
	
	// Agregar al contexto
	conv.Context = append(conv.Context, fmt.Sprintf("Usuario: %s", text))
	if len(conv.Context) > 20 {
		conv.Context = conv.Context[1:]
	}
	
	// Procesar y responder
	go cb.processAndRespond(chatID, text, conv)
}

// Procesar mensaje y generar respuesta de Cascade
func (cb *CascadeBot) processAndRespond(chatID int64, userText string, conv *CascadeConversation) {
	// Generar respuesta como Cascade
	cascadeResponse := cb.generateCascadeResponse(userText, conv)
	
	log.Printf("🤖 Cascade responde: %s", cascadeResponse)
	
	// Registrar respuesta
	msgLog := MessageLog{
		Timestamp: time.Now(),
		Type:      "cascade_text",
		Content:   cascadeResponse,
	}
	conv.Messages = append(conv.Messages, msgLog)
	
	// Agregar al contexto
	conv.Context = append(conv.Context, fmt.Sprintf("Cascade: %s", cascadeResponse))
	if len(conv.Context) > 20 {
		conv.Context = conv.Context[1:]
	}
	
	// Enviar respuesta como audio (siempre)
	cb.sendCascadeVoiceResponse(chatID, cascadeResponse, conv)
}

// Generar respuesta como Cascade
func (cb *CascadeBot) generateCascadeResponse(text string, conv *CascadeConversation) string {
	text = strings.ToLower(strings.TrimSpace(text))
	
	// Análisis del contexto y respuesta personalizada
	contextStr := strings.Join(conv.Context[len(conv.Context)-5:], "\n")
	
	// Comandos específicos para Cascade
	switch {
	case strings.Contains(text, "hola cascade"), strings.Contains(text, "hola"):
		return fmt.Sprintf("¡Hola %s! Soy Cascade, tu asistente de IA. ¿En qué puedo ayudarte hoy con programación, código o cualquier tarea técnica?", conv.FirstName)
		
	case strings.Contains(text, "cómo estás"):
		return "Estoy funcionando perfectamente y lista para ayudarte. Mi sistema está optimizado para darte las mejores respuestas en programación y desarrollo."
		
	case strings.Contains(text, "adiós"), strings.Contains(text, "chao"), strings.Contains(text, "hasta luego"):
		return "¡Hasta luego! Estaré aquí cuando me necesites. No dudes en consultarme para cualquier ayuda técnica."
		
	case strings.Contains(text, "gracias"):
		return "De nada siempre es un placer ayudarte con tus proyectos. ¿Hay algo más en lo que pueda colaborar?"
		
	case strings.Contains(text, "ayuda"), strings.Contains(text, "ayúdame"):
		return `Puedes pedirme ayuda con:
• Programación en múltiples lenguajes
• Debugging y resolución de errores
• Arquitectura de software
• Revisión de código
• Optimización de rendimiento
• Integración de APIs
• Y mucho más...

¿Qué necesitas específicamente?`
		
	case strings.Contains(text, "qué puedes hacer"):
		return `Soy Cascade, especializada en:
🔧 Desarrollo de software
🐛 Debugging y análisis de código
🏗️ Diseño de arquitectura
📊 Optimización y rendimiento
🔌 Integración de sistemas
📚 Mejores prácticas y patrones
🚀 Despliegue y DevOps

Puedes hablarme o escribirme naturalmente. ¡Comienza tu pregunta!`
		
	default:
		// Respuesta contextual inteligente
		return cb.generateIntelligentResponse(text, conv, contextStr)
	}
}

// Generar respuesta inteligente basada en contexto
func (cb *CascadeBot) generateIntelligentResponse(text string, conv *CascadeConversation, contextStr string) string {
	// Aquí se integraría con la API real de Cascade
	// Por ahora, respuestas inteligentes simuladas
	
	// Detectar intenciones comunes
	if strings.Contains(text, "error") || strings.Contains(text, "bug") {
		return "Detecto que tienes un problema técnico. Por favor, describe el error específico y el código relacionado para poder ayudarte a solucionarlo."
	}
	
	if strings.Contains(text, "código") || strings.Contains(text, "programar") {
		return "Puedo ayudarte con código. ¿Qué lenguaje de programación estás usando y qué necesitas implementar o solucionar?"
	}
	
	if strings.Contains(text, "api") || strings.Contains(text, "endpoint") {
		return "Trabajo con APIs es mi especialidad. ¿Necesitas crear, consumir o depurar alguna API específica?"
	}
	
	if strings.Contains(text, "base de datos") || strings.Contains(text, "database") {
		return "Puedo ayudarte con diseño de bases de datos, consultas SQL, optimización o migración. ¿Qué necesitas específicamente?"
	}
	
	// Respuesta por defecto contextual
	if len(conv.Messages) > 2 {
		return "Entiendo tu consulta. Basándome en nuestra conversación, estoy lista para ayudarte. ¿Podrías darme más detalles sobre lo que necesitas?"
	}
	
	return "Soy Cascade, tu asistente técnica. Estoy aquí para ayudarte con programación, desarrollo y resolución de problemas. ¿En qué puedo asistirte hoy?"
}

// Enviar respuesta de voz de Cascade
func (cb *CascadeBot) sendCascadeVoiceResponse(chatID int64, text string, conv *CascadeConversation) {
	// Generar audio con voz de Cascade
	audioPath, err := cb.generateCascadeAudio(text, conv)
	if err != nil {
		log.Printf("❌ Error generando audio de Cascade: %v", err)
		// Fallback a texto
		cb.sendTextMessage(chatID, text)
		return
	}
	defer os.Remove(audioPath)
	
	// Enviar audio
	err = cb.uploadVoice(chatID, audioPath)
	if err != nil {
		log.Printf("❌ Error subiendo audio de Cascade: %v", err)
		// Fallback a texto
		cb.sendTextMessage(chatID, text)
		return
	}
	
	// Registrar envío de voz
	msgLog := MessageLog{
		Timestamp: time.Now(),
		Type:      "cascade_voice",
		Content:   text,
	}
	conv.Messages = append(conv.Messages, msgLog)
}

// Generar audio con voz de Cascade
func (cb *CascadeBot) generateCascadeAudio(text string, conv *CascadeConversation) (string, error) {
	// Preferir TTS del sistema (más rápido y gratuito)
	audioPath, err := cb.systemTTS.TextToSpeech(text, conv.VoiceProfile, conv.Language)
	if err == nil {
		return audioPath, nil
	}
	
	// Fallback a OpenAI TTS si el sistema falla
	log.Printf("🔄 Usando OpenAI TTS como fallback...")
	return cb.ttsEngine.TextToSpeech(text, conv.VoiceProfile, conv.Language)
}

// Métodos auxiliares (reutilizados del bot original)
func (cb *CascadeBot) setWebhook() error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook", cb.config.Token)
	
	data := map[string]interface{}{
		"url": cb.config.WebhookURL,
	}
	
	jsonData, _ := json.Marshal(data)
	resp, err := cb.httpClient.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	return nil
}

func (cb *CascadeBot) getUpdates(offset int, limit int) ([]Update, error) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&limit=%d&timeout=0", 
		cb.config.Token, offset, limit)
	
	resp, err := cb.httpClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var apiResp APIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, err
	}
	
	if !apiResp.OK {
		return nil, fmt.Errorf("API error: %s", apiResp.Description)
	}
	
	var updates []Update
	resultBytes, _ := json.Marshal(apiResp.Result)
	json.Unmarshal(resultBytes, &updates)
	
	return updates, nil
}

func (cb *CascadeBot) downloadAudio(fileID string) (string, error) {
	fileURL, err := cb.getFileURL(fileID)
	if err != nil {
		return "", err
	}
	
	resp, err := cb.httpClient.Get(fileURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	tempPath := filepath.Join(cb.config.TempDir, fmt.Sprintf("cascade_audio_%s.ogg", uuid.New().String()[:8]))
	
	file, err := os.Create(tempPath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	
	_, err = io.Copy(file, resp.Body)
	if err != nil {
		return "", err
	}
	
	return tempPath, nil
}

func (cb *CascadeBot) getFileURL(fileID string) (string, error) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", cb.config.Token, fileID)
	
	resp, err := cb.httpClient.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	
	var apiResp APIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return "", err
	}
	
	if !apiResp.OK {
		return "", fmt.Errorf("API error: %s", apiResp.Description)
	}
	
	result := apiResp.Result.(map[string]interface{})
	filePath := result["file_path"].(string)
	
	return fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", cb.config.Token, filePath), nil
}

func (cb *CascadeBot) uploadVoice(chatID int64, audioPath string) error {
	file, err := os.Open(audioPath)
	if err != nil {
		return err
	}
	defer file.Close()
	
	body := &bytes.Buffer{}
	writer := io.Writer(body)
	io.Copy(writer, file)
	
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendVoice?chat_id=%d", cb.config.Token, chatID)
	
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return err
	}
	
	req.Header.Set("Content-Type", "audio/ogg")
	
	resp, err := cb.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	return nil
}

func (cb *CascadeBot) sendTextMessage(chatID int64, text string) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", cb.config.Token)
	
	data := map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
	}
	
	jsonData, _ := json.Marshal(data)
	resp, err := cb.httpClient.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	return nil
}

func (cb *CascadeBot) sendErrorMessage(chatID int64, message string) {
	errorMsg := fmt.Sprintf("❌ %s", message)
	cb.sendTextMessage(chatID, errorMsg)
}

// Detener bot
func (cb *CascadeBot) Stop() {
	log.Println("🛑 Deteniendo CascadeBot...")
	cb.cancel()
}

// Obtener estadísticas
func (cb *CascadeBot) GetStats() map[string]interface{} {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	
	totalMessages := 0
	activeConversations := 0
	
	for _, conv := range cb.conversations {
		totalMessages += len(conv.Messages)
		if conv.IsActive {
			activeConversations++
		}
	}
	
	return map[string]interface{}{
		"total_conversations":    len(cb.conversations),
		"active_conversations":   activeConversations,
		"total_messages":         totalMessages,
		"bot_active":             cb.isActive,
		"uptime":                 time.Since(time.Now()).String(), // Placeholder
	}
}
