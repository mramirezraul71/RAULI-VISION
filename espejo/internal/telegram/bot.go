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
)

// Configuración del bot de Telegram
type Config struct {
	Token       string `json:"token"`
	WebhookURL  string `json:"webhook_url"`
	AudioDir    string `json:"audio_dir"`
	TempDir     string `json:"temp_dir"`
	MaxFileSize int64  `json:"max_file_size"`
}

// Bot principal de Telegram con comunicación de audio
type Bot struct {
	config        *Config
	httpClient    *http.Client
	audioMgr      *AudioManager
	sttEngine     *STTEngine
	ttsEngine     *TTSEngine
	conversations map[int64]*Conversation
	mu            sync.RWMutex
	ctx           context.Context
	cancel        context.CancelFunc
}

// Conversación activa con un usuario
type Conversation struct {
	UserID      int64
	Username    string
	FirstName   string
	LastName    string
	LastMessage time.Time
	Context     []string
	IsActive    bool
	Language    string
	VoiceID     string
}

// Mensaje de Telegram
type Update struct {
	UpdateID int      `json:"update_id"`
	Message  *Message `json:"message"`
}

type Message struct {
	MessageID int    `json:"message_id"`
	From      *User  `json:"from"`
	Chat      *Chat  `json:"chat"`
	Date      int    `json:"date"`
	Text      string `json:"text"`
	Voice     *Voice `json:"voice"`
	Audio     *Audio `json:"audio"`
}

type User struct {
	ID        int64  `json:"id"`
	IsBot     bool   `json:"is_bot"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name,omitempty"`
	Username  string `json:"username"`
	Language  string `json:"language_code"`
}

type Chat struct {
	ID        int64  `json:"id"`
	Type      string `json:"type"`
	FirstName string `json:"first_name"`
	Username  string `json:"username"`
}

type Voice struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Duration     int    `json:"duration"`
	MimeType     string `json:"mime_type"`
	FileSize     int64  `json:"file_size"`
}

type Audio struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Duration     int    `json:"duration"`
	Performer    string `json:"performer"`
	Title        string `json:"title"`
	MimeType     string `json:"mime_type"`
	FileSize     int64  `json:"file_size"`
}

// Respuesta de API de Telegram
type APIResponse struct {
	OK          bool        `json:"ok"`
	Result      interface{} `json:"result"`
	Description string      `json:"description"`
}

// Nuevo bot de Telegram
func NewBot(config *Config) *Bot {
	ctx, cancel := context.WithCancel(context.Background())

	bot := &Bot{
		config:        config,
		httpClient:    &http.Client{Timeout: 30 * time.Second},
		audioMgr:      NewAudioManager(config.AudioDir, config.TempDir),
		sttEngine:     NewSTTEngine(),
		ttsEngine:     NewTTSEngine(),
		conversations: make(map[int64]*Conversation),
		ctx:           ctx,
		cancel:        cancel,
	}

	// Crear directorios necesarios
	os.MkdirAll(config.AudioDir, 0755)
	os.MkdirAll(config.TempDir, 0755)

	return bot
}

// Iniciar el bot
func (b *Bot) Start() error {
	log.Println("🤖 Iniciando bot de Telegram con comunicación de audio...")

	// Configurar webhook si es necesario
	if b.config.WebhookURL != "" {
		if err := b.setWebhook(); err != nil {
			return fmt.Errorf("error configurando webhook: %w", err)
		}
	}

	// Iniciar procesamiento de actualizaciones
	go b.processUpdates()

	log.Println("✅ Bot de Telegram iniciado correctamente")
	return nil
}

// Detener el bot
func (b *Bot) Stop() {
	log.Println("🛑 Deteniendo bot de Telegram...")
	b.cancel()
}

// Configurar webhook
func (b *Bot) setWebhook() error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook", b.config.Token)

	data := map[string]interface{}{
		"url": b.config.WebhookURL,
	}

	jsonData, _ := json.Marshal(data)
	resp, err := b.httpClient.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// Procesar actualizaciones en tiempo real
func (b *Bot) processUpdates() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	offset := 0

	for {
		select {
		case <-b.ctx.Done():
			return
		case <-ticker.C:
			updates, err := b.getUpdates(offset, 50)
			if err != nil {
				log.Printf("❌ Error obteniendo actualizaciones: %v", err)
				continue
			}

			for _, update := range updates {
				b.handleUpdate(update)
				offset = update.UpdateID + 1
			}
		}
	}
}

// Obtener actualizaciones de Telegram
func (b *Bot) getUpdates(offset int, limit int) ([]Update, error) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&limit=%d&timeout=0",
		b.config.Token, offset, limit)

	resp, err := b.httpClient.Get(url)
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

	// Convertir resultado a []Update
	var updates []Update
	resultBytes, _ := json.Marshal(apiResp.Result)
	json.Unmarshal(resultBytes, &updates)

	return updates, nil
}

// Manejar actualización recibida
func (b *Bot) handleUpdate(update Update) {
	if update.Message == nil {
		return
	}

	msg := update.Message
	user := msg.From
	chat := msg.Chat

	// Obtener o crear conversación
	conv := b.getOrCreateConversation(user.ID, user)

	// Actualizar última actividad
	conv.LastMessage = time.Now()

	// Procesar mensaje según tipo
	if msg.Voice != nil {
		b.handleVoiceMessage(chat.ID, msg.Voice, conv)
	} else if msg.Audio != nil {
		b.handleAudioMessage(chat.ID, msg.Audio, conv)
	} else if msg.Text != "" {
		b.handleTextMessage(chat.ID, msg.Text, conv)
	}
}

// Obtener o crear conversación
func (b *Bot) getOrCreateConversation(userID int64, user *User) *Conversation {
	b.mu.Lock()
	defer b.mu.Unlock()

	conv, exists := b.conversations[userID]
	if !exists {
		conv = &Conversation{
			UserID:    userID,
			Username:  user.Username,
			FirstName: user.FirstName,
			LastName:  user.LastName,
			Context:   make([]string, 0, 10),
			IsActive:  true,
			Language:  user.Language,
			VoiceID:   "default",
		}
		b.conversations[userID] = conv

		// Mensaje de bienvenida
		go b.sendWelcomeMessage(userID)
	}

	return conv
}

// Manejar mensaje de voz
func (b *Bot) handleVoiceMessage(chatID int64, voice *Voice, conv *Conversation) {
	log.Printf("🎤 Mensaje de voz recibido de %s (duración: %ds)", conv.FirstName, voice.Duration)

	// Descargar archivo de audio
	audioPath, err := b.downloadAudio(voice.FileID)
	if err != nil {
		log.Printf("❌ Error descargando audio: %v", err)
		b.sendErrorMessage(chatID, "No pude procesar tu mensaje de voz. Intenta de nuevo.")
		return
	}
	defer os.Remove(audioPath)

	// Convertir audio a texto
	text, err := b.sttEngine.SpeechToText(audioPath, conv.Language)
	if err != nil {
		log.Printf("❌ Error en speech-to-text: %v", err)
		b.sendErrorMessage(chatID, ("No pude entender tu mensaje de voz. ¿Puedes repetirlo o escribirlo?"))
		return
	}

	log.Printf("📝 Texto reconocido: %s", text)

	// Agregar al contexto
	conv.Context = append(conv.Context, text)
	if len(conv.Context) > 10 {
		conv.Context = conv.Context[1:]
	}

	// Procesar el texto y generar respuesta
	response := b.processUserMessage(text, conv)

	// Enviar respuesta como audio
	go b.sendVoiceResponse(chatID, response, conv)
}

// Manejar mensaje de audio
func (b *Bot) handleAudioMessage(chatID int64, audio *Audio, conv *Conversation) {
	log.Printf("🎵 Mensaje de audio recibido de %s (título: %s)", conv.FirstName, audio.Title)

	// Procesar similar a mensaje de voz
	voice := &Voice{
		FileID:   audio.FileID,
		Duration: audio.Duration,
		MimeType: audio.MimeType,
		FileSize: audio.FileSize,
	}

	b.handleVoiceMessage(chatID, voice, conv)
}

// Manejar mensaje de texto
func (b *Bot) handleTextMessage(chatID int64, text string, conv *Conversation) {
	log.Printf("💬 Mensaje de texto recibido de %s: %s", conv.FirstName, text)

	// Agregar al contexto
	conv.Context = append(conv.Context, text)
	if len(conv.Context) > 10 {
		conv.Context = conv.Context[1:]
	}

	// Procesar el texto y generar respuesta
	response := b.processUserMessage(text, conv)

	// Enviar respuesta como audio
	go b.sendVoiceResponse(chatID, response, conv)
}

// Procesar mensaje del usuario y generar respuesta
func (b *Bot) processUserMessage(text string, conv *Conversation) string {
	// Lógica de procesamiento natural
	text = strings.ToLower(strings.TrimSpace(text))

	// Comandos especiales
	switch {
	case strings.Contains(text, "hola"), strings.Contains(text, "buenos días"), strings.Contains(text, "buenas tardes"):
		return fmt.Sprintf("¡Hola %s! Soy tu asistente de voz. ¿En qué puedo ayudarte hoy?", conv.FirstName)

	case strings.Contains(text, "cómo estás"):
		return "Estoy muy bien, gracias por preguntar. Siempre listo para ayudarte con lo que necesites."

	case strings.Contains(text, "adiós"), strings.Contains(text, "chao"), strings.Contains(text, "hasta luego"):
		return "¡Hasta luego! Que tengas un excelente día. Estaré aquí si me necesitas."

	case strings.Contains(text, "ayuda"), strings.Contains(text, "ayúdame"):
		return "Puedes hablarme o escribirme naturalmente. Entiendo mensajes de voz y texto. Te responderé con mi voz. ¿Qué te gustaría hacer?"

	case strings.Contains(text, "gracias"):
		return "De nada siempre es un placer ayudarte. ¿Hay algo más en lo que pueda colaborar?"

	default:
		// Respuesta inteligente basada en contexto
		return b.generateContextualResponse(text, conv)
	}
}

// Generar respuesta contextual
func (b *Bot) generateContextualResponse(text string, conv *Conversation) string {
	// Aquí se puede integrar con IA más avanzada
	// Por ahora, respuestas contextuales simples

	if len(conv.Context) > 1 {
		prevMsg := conv.Context[len(conv.Context)-2]

		// Respuestas basadas en conversación previa
		if strings.Contains(prevMsg, "nombre") && strings.Contains(text, "llamo") {
			return fmt.Sprintf("Mucho gusto, %s. Ya he guardado tu nombre. ¿En qué te puedo asistir?", conv.FirstName)
		}
	}

	// Respuesta por defecto inteligente
	responses := []string{
		"Entiendo lo que me dices. Déjame procesarlo y te ayudaré.",
		"Interesante. Cuéntame más sobre eso para poder ayudarte mejor.",
		"Veo que necesitas asistencia con esto. Estoy aquí para ayudarte.",
		"Comprendo tu solicitud. ¿Podrías darme más detalles?",
		"Gracias por compartir eso. ¿Cómo puedo ser útil en esta situación?",
	}

	return responses[time.Now().Unix()%int64(len(responses))]
}

// Descargar archivo de audio de Telegram
func (b *Bot) downloadAudio(fileID string) (string, error) {
	// Obtener URL del archivo
	fileURL, err := b.getFileURL(fileID)
	if err != nil {
		return "", err
	}

	// Descargar archivo
	resp, err := b.httpClient.Get(fileURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	// Guardar temporalmente
	tempPath := filepath.Join(b.config.TempDir, fmt.Sprintf("audio_%s.ogg", uuid.New().String()[:8]))

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

// Obtener URL de descarga de archivo
func (b *Bot) getFileURL(fileID string) (string, error) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", b.config.Token, fileID)

	resp, err := b.httpClient.Get(url)
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

	// Extraer file_path del resultado
	result := apiResp.Result.(map[string]interface{})
	filePath := result["file_path"].(string)

	return fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", b.config.Token, filePath), nil
}

// Enviar mensaje de bienvenida
func (b *Bot) sendWelcomeMessage(userID int64) {
	welcome := fmt.Sprintf("🎉 ¡Hola! Soy tu asistente de voz personal.\n\n" +
		"🎤 Puedes enviarme mensajes de voz y te responderé con mi voz\n" +
		"💬 También puedes escribirme y te responderé con audio\n" +
		"🤖 Comunicación 100% natural y permanente\n\n" +
		"¡Háblame cuando quieras!")

	b.sendTextMessage(userID, welcome)
}

// Enviar respuesta de voz
func (b *Bot) sendVoiceResponse(chatID int64, text string, conv *Conversation) {
	// Generar archivo de audio
	audioPath, err := b.ttsEngine.TextToSpeech(text, conv.VoiceID, conv.Language)
	if err != nil {
		log.Printf("❌ Error generando audio: %v", err)
		b.sendErrorMessage(chatID, "No pude generar respuesta de audio. Te responderé por texto.")
		b.sendTextMessage(chatID, text)
		return
	}
	defer os.Remove(audioPath)

	// Enviar audio a Telegram
	err = b.uploadVoice(chatID, audioPath)
	if err != nil {
		log.Printf("❌ Error subiendo audio: %v", err)
		b.sendTextMessage(chatID, text)
	}
}

// Subir archivo de voz a Telegram
func (b *Bot) uploadVoice(chatID int64, audioPath string) error {
	file, err := os.Open(audioPath)
	if err != nil {
		return err
	}
	defer file.Close()

	// Crear multipart form
	body := &bytes.Buffer{}
	writer := io.Writer(body)

	// Escribir archivo
	io.Copy(writer, file)

	// Enviar a Telegram
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendVoice?chat_id=%d", b.config.Token, chatID)

	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "audio/ogg")

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// Enviar mensaje de texto
func (b *Bot) sendTextMessage(chatID int64, text string) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", b.config.Token)

	data := map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
	}

	jsonData, _ := json.Marshal(data)
	resp, err := b.httpClient.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// Enviar mensaje de error
func (b *Bot) sendErrorMessage(chatID int64, message string) {
	errorMsg := fmt.Sprintf("❌ %s", message)
	b.sendTextMessage(chatID, errorMsg)
}
