package vault

import (
	"log"
	"time"
)

// ActiveSlot devuelve el slot activo para la semana ISO actual.
// Mapeo: semana ISO % 4 → A(0) | B(1) | C(2) | D(3)
func ActiveSlot() string {
	_, week := time.Now().ISOWeek()
	slots := []string{"A", "B", "C", "D"}
	return slots[week%4]
}

// StartRotationWorker inicia un goroutine que aplica la rotación automática
// cada `intervalDays` días. Se ejecuta al inicio y luego periódicamente.
func (s *Service) StartRotationWorker() {
	go func() {
		// Aplicar al arranque
		slot := ActiveSlot()
		if err := s.applyRotation(slot); err != nil {
			log.Printf("⚠️  Vault rotation (startup): %v", err)
		} else {
			log.Printf("🔄 Vault: slot activo al arranque = %s", slot)
		}

		interval := time.Duration(s.rotationDays) * 24 * time.Hour
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			newSlot := ActiveSlot()
			if err := s.applyRotation(newSlot); err != nil {
				log.Printf("⚠️  Vault rotation (ticker): %v", err)
			} else {
				log.Printf("🔄 Vault: rotación automática → slot %s", newSlot)
			}
		}
	}()
}
