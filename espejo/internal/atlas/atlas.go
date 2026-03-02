package atlas

import (
	"bytes"
	"encoding/json"
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

func Emit(message, level, subsystem string, data map[string]interface{}) {
	if !enabled() || strings.TrimSpace(message) == "" {
		return
	}
	go func() {
		timeout := 1200 * time.Millisecond
		client := &http.Client{Timeout: timeout}
		body := eventPayload{
			Message:   message,
			Level:     level,
			Subsystem: subsystem,
			Data:      data,
		}
		raw, err := json.Marshal(body)
		if err != nil {
			return
		}
		req, err := http.NewRequest("POST", baseURL()+"/api/comms/hub/emit", bytes.NewBuffer(raw))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return
		}
		_ = resp.Body.Close()
	}()
}
