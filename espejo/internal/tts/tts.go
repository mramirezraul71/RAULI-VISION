// Package tts provee síntesis de voz mediante la API TTS de Gemini.
// Modelo: gemini-2.5-flash-preview-tts
// Audio de salida: PCM 16-bit / 24 kHz / mono → empaquetado en WAV.
package tts

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	ttsModel      = "gemini-2.5-flash-preview-tts"
	ttsVoice      = "Aoede" // Voz femenina cálida — adecuada para asistente
	ttsSampleRate = 24000
	ttsChannels   = 1
	ttsBits       = 16
	ttsMaxRunes   = 600 // límite de caracteres antes de recortar
)

// Service gestiona la síntesis de voz a través de Gemini TTS.
type Service struct {
	apiKey string
	client *http.Client
}

// New crea un Service. Si apiKey está vacío el servicio no estará disponible.
func New(apiKey string) *Service {
	return &Service{
		apiKey: strings.TrimSpace(apiKey),
		client: &http.Client{Timeout: 35 * time.Second},
	}
}

// Available indica si la API key está configurada y el servicio puede usarse.
func (s *Service) Available() bool {
	return s.apiKey != ""
}

// Synthesize convierte texto a audio WAV usando Gemini TTS.
// Devuelve los bytes WAV listos para enviar al cliente con Content-Type: audio/wav.
func (s *Service) Synthesize(text string) ([]byte, error) {
	if s.apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY no configurado")
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, fmt.Errorf("texto vacío")
	}
	// Recortar para no superar el límite y mantener la latencia baja
	if runes := []rune(text); len(runes) > ttsMaxRunes {
		text = string(runes[:ttsMaxRunes]) + "…"
	}

	reqBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]string{{"text": "Say aloud: " + text}}},
		},
		"generationConfig": map[string]interface{}{
			"responseModalities": []string{"AUDIO"},
			"speechConfig": map[string]interface{}{
				"voiceConfig": map[string]interface{}{
					"prebuiltVoiceConfig": map[string]string{
						"voiceName": ttsVoice,
					},
				},
			},
		},
	}
	bodyJSON, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("error serializando petición TTS: %w", err)
	}

	apiURL := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		ttsModel, s.apiKey,
	)
	req, err := http.NewRequest(http.MethodPost, apiURL, bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error conectando con Gemini TTS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Gemini TTS respondió HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var gemResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					InlineData struct {
						MimeType string `json:"mimeType"`
						Data     string `json:"data"` // base64 PCM
					} `json:"inlineData"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gemResp); err != nil {
		return nil, fmt.Errorf("error decodificando respuesta TTS: %w", err)
	}
	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("Gemini TTS devolvió respuesta vacía")
	}

	pcm, err := base64.StdEncoding.DecodeString(
		gemResp.Candidates[0].Content.Parts[0].InlineData.Data,
	)
	if err != nil {
		return nil, fmt.Errorf("error decodificando audio base64: %w", err)
	}

	return buildWAV(pcm), nil
}

// buildWAV empaqueta PCM de 16-bit / 24 kHz / mono en un contenedor WAV estándar.
func buildWAV(pcm []byte) []byte {
	dataSize   := uint32(len(pcm))
	byteRate   := uint32(ttsSampleRate * ttsChannels * ttsBits / 8)
	blockAlign := uint16(ttsChannels * ttsBits / 8)

	buf := bytes.NewBuffer(make([]byte, 0, 44+len(pcm)))
	buf.WriteString("RIFF")
	_ = binary.Write(buf, binary.LittleEndian, dataSize+36) // ChunkSize
	buf.WriteString("WAVE")
	buf.WriteString("fmt ")
	_ = binary.Write(buf, binary.LittleEndian, uint32(16))             // Subchunk1Size (PCM)
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))              // AudioFormat PCM
	_ = binary.Write(buf, binary.LittleEndian, uint16(ttsChannels))
	_ = binary.Write(buf, binary.LittleEndian, uint32(ttsSampleRate))
	_ = binary.Write(buf, binary.LittleEndian, byteRate)
	_ = binary.Write(buf, binary.LittleEndian, blockAlign)
	_ = binary.Write(buf, binary.LittleEndian, uint16(ttsBits))
	buf.WriteString("data")
	_ = binary.Write(buf, binary.LittleEndian, dataSize)
	buf.Write(pcm)
	return buf.Bytes()
}
