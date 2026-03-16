// Package vault gestiona el catálogo de contenido offline de RAULI Vault.
// Dos canales: "cami" (contenido cristiano) y "variado" (entretenimiento general).
// Categorías: "pelicula" | "musica" | "musicvideo"
// Almacenamiento: disco local (VAULT_ROOT, default ./storage/vault)
// Rotación de películas: semanal por slots A/B/C/D
package vault

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Item representa una entrada del catálogo del Vault.
type Item struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Artist       string    `json:"artist,omitempty"`
	Category     string    `json:"category"` // pelicula | musica | musicvideo
	Channel      string    `json:"channel"`  // cami | variado
	Genre        string    `json:"genre,omitempty"`
	Filename     string    `json:"filename"`
	FilePath     string    `json:"-"` // ruta absoluta — no se expone
	Thumbnail    string    `json:"thumbnail,omitempty"`
	DurationSecs int       `json:"duration_secs,omitempty"`
	FileSizeBytes int64    `json:"file_size_bytes,omitempty"`
	RotationSlot string    `json:"rotation_slot,omitempty"` // A | B | C | D (solo peliculas)
	Active       bool      `json:"active"`
	Plays        int       `json:"plays"`
	CreatedAt    time.Time `json:"created_at"`
}

// CatalogResponse es la respuesta de GET /api/vault/catalog
type CatalogResponse struct {
	OK       bool   `json:"ok"`
	Items    []Item `json:"items"`
	Total    int    `json:"total"`
	Channel  string `json:"channel,omitempty"`
	Category string `json:"category,omitempty"`
}

// StatusResponse es la respuesta de GET /api/vault/admin/status
type StatusResponse struct {
	OK            bool    `json:"ok"`
	VaultRoot     string  `json:"vault_root"`
	TotalItems    int     `json:"total_items"`
	ActiveItems   int     `json:"active_items"`
	TotalSizeGB   float64 `json:"total_size_gb"`
	ActiveSlot    string  `json:"active_slot"`
	NextRotation  string  `json:"next_rotation"`
	DBPath        string  `json:"db_path"`
	YtdlpVersion  string  `json:"ytdlp_version,omitempty"`
	YtdlpPath     string  `json:"ytdlp_path,omitempty"`
}

// Service es el servicio principal del Vault.
type Service struct {
	mu           sync.RWMutex
	db           *sql.DB
	vaultRoot    string
	rotationDays int
	adminToken   string
}

// New crea e inicializa el servicio Vault.
// vaultRoot: directorio raíz del almacenamiento (VAULT_ROOT env o ./storage/vault).
// rotationDays: días entre rotaciones (VAULT_ROTATION_DAYS env o 7).
func New(adminToken string) *Service {
	root := strings.TrimSpace(os.Getenv("VAULT_ROOT"))
	if root == "" {
		root = "storage/vault"
	}
	days := 7
	if v := strings.TrimSpace(os.Getenv("VAULT_ROTATION_DAYS")); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			days = n
		}
	}

	svc := &Service{
		vaultRoot:    root,
		rotationDays: days,
		adminToken:   adminToken,
	}

	// Crear directorios del vault si no existen
	for _, ch := range []string{"cami", "variado"} {
		for _, cat := range []string{"peliculas", "musica", "musicvideos"} {
			_ = os.MkdirAll(filepath.Join(root, ch, cat), 0755)
		}
	}

	// Abrir SQLite para el catálogo (con fallback a directorio local si el configurado falla)
	svc.db = openVaultDB(svc, root)
	if svc.db == nil && root != "storage/vault" {
		log.Printf("⚠️  Vault: %s no disponible, usando fallback local storage/vault", root)
		fallbackRoot := "storage/vault"
		for _, ch := range []string{"cami", "variado"} {
			for _, cat := range []string{"peliculas", "musica", "musicvideos"} {
				_ = os.MkdirAll(filepath.Join(fallbackRoot, ch, cat), 0755)
			}
		}
		svc.vaultRoot = fallbackRoot
		svc.db = openVaultDB(svc, fallbackRoot)
	}
	if svc.db != nil {
		log.Printf("🎬 Vault inicializado: root=%s rotación=%dd", svc.vaultRoot, days)
	}
	return svc
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS vault_items (
			id            TEXT PRIMARY KEY,
			title         TEXT NOT NULL,
			artist        TEXT NOT NULL DEFAULT '',
			category      TEXT NOT NULL CHECK(category IN ('pelicula','musica','musicvideo')),
			channel       TEXT NOT NULL CHECK(channel IN ('cami','variado')),
			genre         TEXT NOT NULL DEFAULT '',
			filename      TEXT NOT NULL,
			file_path     TEXT NOT NULL,
			thumbnail     TEXT NOT NULL DEFAULT '',
			duration_secs INTEGER NOT NULL DEFAULT 0,
			file_size_bytes INTEGER NOT NULL DEFAULT 0,
			rotation_slot TEXT NOT NULL DEFAULT '',
			active        INTEGER NOT NULL DEFAULT 1,
			plays         INTEGER NOT NULL DEFAULT 0,
			created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_vault_channel_cat ON vault_items(channel, category, active);
		CREATE INDEX IF NOT EXISTS idx_vault_slot ON vault_items(rotation_slot, active);
	`)
	return err
}

// requireAdmin valida el token admin. Devuelve true si es válido.
func (s *Service) requireAdmin(r *http.Request) bool {
	if s.adminToken == "" {
		return false
	}
	tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if tok == "" {
		tok = r.Header.Get("X-Admin-Token")
	}
	return tok == s.adminToken
}

// writeJSON escribe una respuesta JSON.
func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// HandleCatalog sirve GET /api/vault/catalog
// Query params: channel=cami|variado, category=pelicula|musica|musicvideo, genre=..., q=busqueda
func (s *Service) HandleCatalog(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		// Vault no inicializado (disco no montado): devolver catálogo vacío — no es error de red
		writeJSON(w, http.StatusOK, CatalogResponse{OK: true, Items: []Item{}, Total: 0})
		return
	}
	ch := r.URL.Query().Get("channel")
	cat := r.URL.Query().Get("category")
	genre := r.URL.Query().Get("genre")
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))

	query := `SELECT id, title, artist, category, channel, genre, filename, file_path,
	          thumbnail, duration_secs, file_size_bytes, rotation_slot, active, plays, created_at
	          FROM vault_items WHERE active = 1`
	args := []any{}
	if ch != "" {
		query += " AND channel = ?"
		args = append(args, ch)
	}
	if cat != "" {
		query += " AND category = ?"
		args = append(args, cat)
	}
	if genre != "" {
		query += " AND genre = ?"
		args = append(args, genre)
	}
	query += " ORDER BY created_at DESC"

	s.mu.RLock()
	rows, err := s.db.Query(query, args...)
	s.mu.RUnlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var it Item
		var createdStr string
		var active int
		if err := rows.Scan(&it.ID, &it.Title, &it.Artist, &it.Category, &it.Channel,
			&it.Genre, &it.Filename, &it.FilePath, &it.Thumbnail, &it.DurationSecs,
			&it.FileSizeBytes, &it.RotationSlot, &active, &it.Plays, &createdStr); err != nil {
			continue
		}
		it.Active = active == 1
		it.FilePath = "" // no exponer ruta
		// Parsear created_at desde SQLite (puede venir como "2006-01-02 15:04:05" o RFC3339)
		for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05Z"} {
			if t, err := time.Parse(layout, createdStr); err == nil {
				it.CreatedAt = t
				break
			}
		}
		if q != "" && !strings.Contains(strings.ToLower(it.Title), q) &&
			!strings.Contains(strings.ToLower(it.Artist), q) &&
			!strings.Contains(strings.ToLower(it.Genre), q) {
			continue
		}
		items = append(items, it)
	}
	if items == nil {
		items = []Item{}
	}
	writeJSON(w, http.StatusOK, CatalogResponse{OK: true, Items: items, Total: len(items), Channel: ch, Category: cat})
}

// HandleStream sirve GET /api/vault/stream/{id} con soporte de Range requests.
func (s *Service) HandleStream(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/vault/stream/")
	id = strings.Trim(id, "/")
	if id == "" {
		http.Error(w, "id requerido", http.StatusBadRequest)
		return
	}
	if s.db == nil {
		http.Error(w, "vault no disponible", http.StatusServiceUnavailable)
		return
	}

	s.mu.RLock()
	row := s.db.QueryRow(`SELECT file_path, filename, category FROM vault_items WHERE id = ? AND active = 1`, id)
	var filePath, filename, category string
	err := row.Scan(&filePath, &filename, &category)
	s.mu.RUnlock()

	if err == sql.ErrNoRows {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	f, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "archivo no encontrado en disco", http.StatusNotFound)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		http.Error(w, "error al leer archivo", http.StatusInternalServerError)
		return
	}

	// Incrementar plays de forma asíncrona
	go func() {
		s.mu.Lock()
		_, _ = s.db.Exec(`UPDATE vault_items SET plays = plays + 1 WHERE id = ?`, id)
		s.mu.Unlock()
	}()

	// Content-Type basado en extensión
	ct := "application/octet-stream"
	if ext := strings.ToLower(filepath.Ext(filename)); ext != "" {
		if m := mimeForExt(ext); m != "" {
			ct = m
		}
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-store") // streams no se cachean

	// http.ServeContent maneja Range, If-Modified-Since, etc.
	http.ServeContent(w, r, filename, stat.ModTime(), f)
}

func mimeForExt(ext string) string {
	switch ext {
	case ".mp4", ".m4v":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mp3":
		return "audio/mpeg"
	case ".m4a":
		return "audio/mp4"
	case ".ogg":
		return "audio/ogg"
	default:
		return ""
	}
}

// HandleAdminUpload sirve POST /api/vault/admin/upload (multipart form)
// Campos: title, artist, category, channel, genre, rotation_slot, duration_secs
// Archivo: campo "file"
func (s *Service) HandleAdminUpload(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "no autorizado"})
		return
	}
	if s.db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "vault no disponible"})
		return
	}

	// Limitar tamaño máximo: 2 GB
	if err := r.ParseMultipartForm(2 << 30); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "form inválido: " + err.Error()})
		return
	}

	title := strings.TrimSpace(r.FormValue("title"))
	artist := strings.TrimSpace(r.FormValue("artist"))
	category := strings.TrimSpace(r.FormValue("category"))
	channel := strings.TrimSpace(r.FormValue("channel"))
	genre := strings.TrimSpace(r.FormValue("genre"))
	slot := strings.ToUpper(strings.TrimSpace(r.FormValue("rotation_slot")))
	thumbnail := strings.TrimSpace(r.FormValue("thumbnail"))
	durStr := r.FormValue("duration_secs")

	if title == "" || category == "" || channel == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "title, category y channel son requeridos"})
		return
	}
	validCat := map[string]bool{"pelicula": true, "musica": true, "musicvideo": true}
	validCh := map[string]bool{"cami": true, "variado": true}
	if !validCat[category] || !validCh[channel] {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "category o channel inválidos"})
		return
	}
	if slot != "" && slot != "A" && slot != "B" && slot != "C" && slot != "D" {
		slot = "A"
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "campo 'file' requerido"})
		return
	}
	defer file.Close()

	// Determinar subdirectorio
	subDir := map[string]string{"pelicula": "peliculas", "musica": "musica", "musicvideo": "musicvideos"}[category]
	destDir := filepath.Join(s.vaultRoot, channel, subDir)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "no se pudo crear directorio"})
		return
	}

	// Sanitizar nombre de archivo
	safeName := sanitizeFilename(header.Filename)
	destPath := filepath.Join(destDir, safeName)

	// Escribir archivo en disco
	out, err := os.Create(destPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "no se pudo crear archivo: " + err.Error()})
		return
	}
	written, copyErr := copyBuffer(out, file)
	out.Close()
	if copyErr != nil {
		_ = os.Remove(destPath)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "error al escribir archivo"})
		return
	}

	var durSecs int
	fmt.Sscanf(durStr, "%d", &durSecs)

	// Determinar si activo: peliculas con slot se activan según rotación actual
	active := 1
	if category == "pelicula" && slot != "" {
		if slot != ActiveSlot() {
			active = 0
		}
	}

	id := newID()
	s.mu.Lock()
	_, dbErr := s.db.Exec(`
		INSERT INTO vault_items(id, title, artist, category, channel, genre, filename, file_path,
		thumbnail, duration_secs, file_size_bytes, rotation_slot, active)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
	`, id, title, artist, category, channel, genre, safeName, destPath,
		thumbnail, durSecs, written, slot, active)
	s.mu.Unlock()

	if dbErr != nil {
		_ = os.Remove(destPath)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "error al guardar en catálogo: " + dbErr.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"id":       id,
		"filename": safeName,
		"size":     written,
		"active":   active == 1,
	})
}

// HandleAdminRotate sirve POST /api/vault/admin/rotate
// Fuerza la rotación al siguiente slot (o al slot especificado en body {"slot":"B"})
func (s *Service) HandleAdminRotate(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "no autorizado"})
		return
	}
	if s.db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "vault no disponible"})
		return
	}

	var body struct {
		Slot string `json:"slot"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	slot := strings.ToUpper(strings.TrimSpace(body.Slot))
	if slot == "" || (slot != "A" && slot != "B" && slot != "C" && slot != "D") {
		slot = ActiveSlot()
	}

	if err := s.applyRotation(slot); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "active_slot": slot, "rotated_at": time.Now().UTC().Format(time.RFC3339)})
}

// HandleAdminStatus sirve GET /api/vault/admin/status
func (s *Service) HandleAdminStatus(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "no autorizado"})
		return
	}
	if s.db == nil {
		writeJSON(w, http.StatusOK, StatusResponse{OK: false, VaultRoot: s.vaultRoot})
		return
	}

	s.mu.RLock()
	var total, active int
	var totalSize int64
	_ = s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(file_size_bytes),0) FROM vault_items`).Scan(&total, &totalSize)
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM vault_items WHERE active = 1`).Scan(&active)
	s.mu.RUnlock()

	slot := ActiveSlot()
	yr, wk := time.Now().ISOWeek()
	nextRot := time.Now().AddDate(0, 0, s.rotationDays).Format("2006-01-02")
	_ = yr + wk // evitar unused

	ytPath := resolveYtdlp()
	ytVer := ""
	if ytPath != "" {
		if out, err := exec.Command(ytPath, "--version").Output(); err == nil {
			ytVer = strings.TrimSpace(string(out))
		}
	}

	writeJSON(w, http.StatusOK, StatusResponse{
		OK:           true,
		VaultRoot:    s.vaultRoot,
		TotalItems:   total,
		ActiveItems:  active,
		TotalSizeGB:  float64(totalSize) / (1 << 30),
		ActiveSlot:   slot,
		NextRotation: nextRot,
		DBPath:       filepath.Join(s.vaultRoot, "vault.db"),
		YtdlpPath:    ytPath,
		YtdlpVersion: ytVer,
	})
}

// HandleAdminDelete sirve DELETE /api/vault/admin/item/{id}
func (s *Service) HandleAdminDelete(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "no autorizado"})
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/vault/admin/item/")
	id = strings.Trim(id, "/")
	if id == "" || s.db == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "id requerido"})
		return
	}

	s.mu.Lock()
	row := s.db.QueryRow(`SELECT file_path FROM vault_items WHERE id = ?`, id)
	var fp string
	_ = row.Scan(&fp)
	_, err := s.db.Exec(`DELETE FROM vault_items WHERE id = ?`, id)
	s.mu.Unlock()

	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if fp != "" {
		_ = os.Remove(fp)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": id})
}

// HandleAdminSeed sirve POST /api/vault/admin/seed — dispara el seeder en segundo plano.
func (s *Service) HandleAdminSeed(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "no autorizado"})
		return
	}
	go func() {
		targets := collectSeedTargets()
		ytdlpPath := resolveYtdlp()
		if ytdlpPath == "" || len(targets) == 0 {
			log.Printf("⚠️  Vault admin/seed: yt-dlp no disponible o sin targets")
			return
		}
		maxPerRun := 8
		s.runAllSeeds(ytdlpPath, targets, maxPerRun)
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "message": "seed iniciado en segundo plano"})
}

// HandleAdminScan sirve POST /api/vault/admin/scan — fuerza un re-escaneo inmediato.
func (s *Service) HandleAdminScan(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "no autorizado"})
		return
	}
	go s.scanOnce()
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "message": "escaneo iniciado en segundo plano"})
}

// applyRotation activa el slot indicado y desactiva el resto (solo para peliculas con slot asignado).
func (s *Service) applyRotation(slot string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	// Desactivar todas las películas con slot asignado
	if _, err := tx.Exec(`UPDATE vault_items SET active = 0 WHERE category = 'pelicula' AND rotation_slot != ''`); err != nil {
		_ = tx.Rollback()
		return err
	}
	// Activar las del slot indicado
	if _, err := tx.Exec(`UPDATE vault_items SET active = 1 WHERE category = 'pelicula' AND rotation_slot = ?`, slot); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func openVaultDB(_ *Service, root string) *sql.DB {
	dbPath := filepath.Join(root, "vault.db")
	db, err := sql.Open("sqlite", dbPath+"?_journal=WAL&_busy_timeout=5000")
	if err != nil {
		log.Printf("⚠️  Vault: no se pudo abrir SQLite %s: %v", dbPath, err)
		return nil
	}
	db.SetMaxOpenConns(1)
	if err := migrate(db); err != nil {
		log.Printf("⚠️  Vault: migración fallida en %s: %v", dbPath, err)
		db.Close()
		return nil
	}
	return db
}

// helpers ─────────────────────────────────────────────────────────────────────

func sanitizeFilename(name string) string {
	base := filepath.Base(name)
	// Reemplazar caracteres peligrosos
	safe := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '.' || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, base)
	if safe == "" || safe == "." {
		safe = "file_" + newID()
	}
	return safe
}

func newID() string {
	return fmt.Sprintf("%x", time.Now().UnixNano())
}

// copyBuffer copia src → dst y devuelve bytes escritos.
func copyBuffer(dst interface{ Write([]byte) (int, error) }, src interface{ Read([]byte) (int, error) }) (int64, error) {
	buf := make([]byte, 32*1024)
	var total int64
	for {
		nr, er := src.Read(buf)
		if nr > 0 {
			nw, ew := dst.Write(buf[:nr])
			if nw > 0 {
				total += int64(nw)
			}
			if ew != nil {
				return total, ew
			}
		}
		if er != nil {
			if er.Error() == "EOF" {
				break
			}
			return total, er
		}
	}
	return total, nil
}
