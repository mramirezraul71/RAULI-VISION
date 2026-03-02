package atlas

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type eventPayload struct {
	Message   string                 `json:"message"`
	Level     string                 `json:"level"`
	Subsystem string                 `json:"subsystem"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

func baseURL() string {
	base := strings.TrimSpace(os.Getenv("ATLAS_BASE_URL"))
	if base == "" {
		base = "http://127.0.0.1:8791"
	}
	return strings.TrimRight(base, "/")
}

func enabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("ATLAS_EVENTS_ENABLED")))
	return v == "" || (v != "0" && v != "false" && v != "no" && v != "off")
}

func timeout() time.Duration {
	v := strings.TrimSpace(os.Getenv("ATLAS_EVENT_TIMEOUT_MS"))
	if v == "" {
		return 2 * time.Second
	}
	ms, err := time.ParseDuration(v + "ms")
	if err != nil || ms <= 0 {
		return 2 * time.Second
	}
	return ms
}

func postEvent(body eventPayload) error {
	client := &http.Client{Timeout: timeout()}
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", baseURL()+"/api/comms/hub/emit", bytes.NewBuffer(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &httpError{statusCode: resp.StatusCode}
	}
	return nil
}

type httpError struct{ statusCode int }

func (e *httpError) Error() string {
	return "atlas bridge status " + http.StatusText(e.statusCode)
}

func Emit(message, level, subsystem string, data map[string]interface{}) {
	if !enabled() || strings.TrimSpace(message) == "" {
		return
	}
	body := eventPayload{
		Message:   message,
		Level:     level,
		Subsystem: subsystem,
		Data:      data,
	}
	var lastErr error
	for i := 0; i < 2; i++ {
		if err := postEvent(body); err == nil {
			return
		} else {
			lastErr = err
			time.Sleep(200 * time.Millisecond)
		}
	}
	if lastErr != nil {
		log.Printf("atlas.Emit failed: %v", lastErr)
	}
}
