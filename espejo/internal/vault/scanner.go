package vault

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// extensionesMedia soportadas por el vault.
var extensionesMedia = map[string]bool{
	".mp4": true, ".m4v": true, ".webm": true,
	".mp3": true, ".m4a": true, ".ogg": true,
}

// dirToCategory mapea nombre de subdirectorio → category válida del vault.
var dirToCategory = map[string]string{
	"peliculas":   "pelicula",
	"musica":      "musica",
	"musicvideos": "musicvideo",
}

// StartScanWorker inicia el goroutine de escaneo automático.
// Escanea al arranque y luego cada VAULT_SCAN_HOURS horas (default 6).
func (s *Service) StartScanWorker() {
	hours := 6
	if v := strings.TrimSpace(os.Getenv("VAULT_SCAN_HOURS")); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			hours = n
		}
	}

	go func() {
		s.scanOnce()

		ticker := time.NewTicker(time.Duration(hours) * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			s.scanOnce()
		}
	}()
}

// scanOnce recorre la estructura de directorios del vault y registra
// los archivos de media que aún no están en el catálogo.
func (s *Service) scanOnce() {
	if s.db == nil {
		return
	}
	added := 0
	for _, channel := range []string{"cami", "variado"} {
		for subDir, category := range dirToCategory {
			dir := filepath.Join(s.vaultRoot, channel, subDir)
			entries, err := os.ReadDir(dir)
			if err != nil {
				continue // directorio puede no existir aún
			}
			for _, e := range entries {
				if e.IsDir() {
					continue
				}
				ext := strings.ToLower(filepath.Ext(e.Name()))
				if !extensionesMedia[ext] {
					continue
				}
				fullPath := filepath.Join(dir, e.Name())
				if s.alreadyIndexed(fullPath) {
					continue
				}
				if err := s.autoRegister(fullPath, e.Name(), channel, category); err != nil {
					log.Printf("⚠️  Vault scanner: no se pudo registrar %s: %v", e.Name(), err)
				} else {
					added++
					log.Printf("📥 Vault scanner: registrado %s (%s/%s)", e.Name(), channel, category)
				}
			}
		}
	}
	if added > 0 {
		log.Printf("✅ Vault scanner: %d archivo(s) nuevo(s) registrado(s)", added)
	}
}

// alreadyIndexed comprueba si file_path ya existe en vault_items.
func (s *Service) alreadyIndexed(filePath string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var count int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM vault_items WHERE file_path = ?`, filePath).Scan(&count)
	return count > 0
}

// autoRegister inserta un archivo de media en vault_items con metadatos inferidos del filesystem.
func (s *Service) autoRegister(filePath, filename, channel, category string) error {
	title := filenameToTitle(filename)

	slot := ""
	active := 1
	if category == "pelicula" {
		slot = s.nextRotationSlot()
		if slot != ActiveSlot() {
			active = 0
		}
	}

	var sizeBytes int64
	if info, err := os.Stat(filePath); err == nil {
		sizeBytes = info.Size()
	}

	id := newID()
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`
		INSERT INTO vault_items(id, title, artist, category, channel, genre,
		  filename, file_path, thumbnail, duration_secs, file_size_bytes,
		  rotation_slot, active)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
	`, id, title, "", category, channel, "",
		filename, filePath, "", 0, sizeBytes,
		slot, active)
	return err
}

// nextRotationSlot asigna el slot de rotación distribuyendo las películas
// equitativamente entre A, B, C, D.
func (s *Service) nextRotationSlot() string {
	slots := []string{"A", "B", "C", "D"}
	counts := make([]int, 4)
	rows, err := s.db.Query(`
		SELECT rotation_slot, COUNT(*) FROM vault_items
		WHERE category='pelicula' AND rotation_slot != ''
		GROUP BY rotation_slot`)
	if err != nil {
		return "A"
	}
	defer rows.Close()
	for rows.Next() {
		var sl string
		var cnt int
		if rows.Scan(&sl, &cnt) == nil {
			for i, s := range slots {
				if s == sl {
					counts[i] = cnt
				}
			}
		}
	}
	minIdx := 0
	for i := 1; i < 4; i++ {
		if counts[i] < counts[minIdx] {
			minIdx = i
		}
	}
	return slots[minIdx]
}

// filenameToTitle convierte nombre de archivo en título legible.
// Ej: "Un_Dia_a_la_Vez___Blues_Gospel.mp3" → "Un Dia a la Vez Blues Gospel"
func filenameToTitle(filename string) string {
	name := strings.TrimSuffix(filename, filepath.Ext(filename))
	name = strings.ReplaceAll(name, "_", " ")
	name = strings.ReplaceAll(name, "-", " ")
	return strings.Join(strings.Fields(name), " ")
}
