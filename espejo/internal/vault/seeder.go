package vault

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// seedTarget describe una fuente de contenido para un canal+categoría.
type seedTarget struct {
	channel  string // cami | variado
	category string // musica | pelicula | musicvideo
	ids      []string
}

// StartSeedWorker descarga automáticamente contenido de YouTube usando yt-dlp.
//
// Variables de entorno por canal y categoría:
//
//	VAULT_SEED_CAMI_MUSICA         — IDs/URLs YouTube para cami/musica
//	VAULT_SEED_CAMI_PELICULAS      — IDs/URLs YouTube para cami/peliculas
//	VAULT_SEED_CAMI_MUSICVIDEOS    — IDs/URLs YouTube para cami/musicvideos
//	VAULT_SEED_VARIADO_MUSICA      — IDs/URLs YouTube para variado/musica
//	VAULT_SEED_VARIADO_PELICULAS   — IDs/URLs YouTube para variado/peliculas
//	VAULT_SEED_VARIADO_MUSICVIDEOS — IDs/URLs YouTube para variado/musicvideos
//
// Cada variable acepta IDs de video, playlists y URLs de canal, separados por comas.
//
//	VAULT_SEED_INTERVAL_DAYS  — días entre re-descargas (default: 7)
//	VAULT_SEED_MAX_PER_RUN    — máx nuevas descargas por categoría por ejecución (default: 10)
//	YTDLP_PATH                — ruta al binario yt-dlp (default: ./yt-dlp)
func (s *Service) StartSeedWorker() {
	targets := collectSeedTargets()
	if len(targets) == 0 {
		return
	}

	ytdlpPath := resolveYtdlp()
	if ytdlpPath == "" {
		log.Printf("⚠️  Vault seeder: yt-dlp no encontrado — instálalo o configura YTDLP_PATH")
		return
	}

	intervalDays := 7
	if v := strings.TrimSpace(os.Getenv("VAULT_SEED_INTERVAL_DAYS")); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			intervalDays = n
		}
	}

	maxPerRun := 10
	if v := strings.TrimSpace(os.Getenv("VAULT_SEED_MAX_PER_RUN")); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			maxPerRun = n
		}
	}

	log.Printf("🎬 Vault seeder activo: %d configuración(es), intervalo=%dd, max=%d/cat, yt-dlp=%s",
		len(targets), intervalDays, maxPerRun, ytdlpPath)

	go func() {
		time.Sleep(15 * time.Second) // esperar init del sistema
		s.runAllSeeds(ytdlpPath, targets, maxPerRun)

		ticker := time.NewTicker(time.Duration(intervalDays) * 24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			s.runAllSeeds(ytdlpPath, targets, maxPerRun)
		}
	}()
}

// runAllSeeds ejecuta el seeder para cada canal/categoría configurado.
func (s *Service) runAllSeeds(ytdlpPath string, targets []seedTarget, maxPerRun int) {
	if s.db == nil {
		return
	}
	totalNew := 0
	for _, t := range targets {
		subDir := catToSubdir(t.category)
		destDir := filepath.Join(s.vaultRoot, t.channel, subDir)
		if err := os.MkdirAll(destDir, 0755); err != nil {
			log.Printf("⚠️  Vault seeder: no se pudo crear %s: %v", destDir, err)
			continue
		}
		archivePath := filepath.Join(destDir, ".yt-archive")
		beforeCount := countMediaFiles(destDir)

		for _, target := range t.ids {
			if err := downloadTarget(ytdlpPath, target, destDir, archivePath, t.category, maxPerRun); err != nil {
				log.Printf("⚠️  Vault seeder [%s/%s %s]: %v", t.channel, t.category, target, err)
			}
		}

		afterCount := countMediaFiles(destDir)
		newFiles := afterCount - beforeCount
		if newFiles > 0 {
			totalNew += newFiles
			log.Printf("📥 Vault seeder [%s/%s]: %d archivo(s) nuevo(s)", t.channel, t.category, newFiles)
		}
	}

	if totalNew > 0 {
		log.Printf("✅ Vault seeder: %d total nuevo(s) — re-escaneando...", totalNew)
		s.scanOnce()
	}
}

// downloadTarget llama a yt-dlp para un video, playlist o URL de canal.
// maxItems limita las descargas nuevas por ejecución (0 = sin límite).
func downloadTarget(ytdlpPath, target, destDir, archivePath, category string, maxItems int) error {
	if isVideoID(target) {
		target = "https://www.youtube.com/watch?v=" + target
	}

	outTemplate := filepath.Join(destDir, "%(title)s [%(id)s].%(ext)s")

	args := []string{
		"--download-archive", archivePath,
		"--output", outTemplate,
		"--no-mtime",
		"--quiet",
		"--no-warnings",
		"--retries", "3",
		// Usar cliente web para compatibilidad mejorada
		"--extractor-args", "youtube:player_client=web",
		// Limitar enumeración de playlist/canal para evitar timeouts
		"--playlist-end", "30",
		// No abortar todo el canal si un video individual falla
		"--ignore-errors",
		// Evitar fragmentos que requieren autenticación
		"--no-part",
	}
	if maxItems > 0 {
		args = append(args, "--max-downloads", fmt.Sprintf("%d", maxItems))
	}

	switch category {
	case "musica":
		args = append(args,
			"--format", "bestaudio/best",
			"--extract-audio",
			"--audio-format", "mp3",
			"--audio-quality", "5", // ~128 kbps
		)
	case "musicvideo", "pelicula":
		// best[ext=mp4] descarga un MP4 pre-mergeado sin necesitar ffmpeg.
		// Fallback a best[height<=480] si no hay MP4 simple disponible.
		args = append(args,
			"--format", "best[ext=mp4][height<=480]/best[height<=480]/best",
		)
		if category == "pelicula" {
			args = append(args, "--match-filter", "duration < 7200")
		}
	}

	args = append(args, "--", target)

	cmd := exec.Command(ytdlpPath, args...)
	cmd.Env = os.Environ()
	if out, err := cmd.CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		if msg != "" {
			return fmt.Errorf("%v — %s", err, msg)
		}
		return err
	}
	return nil
}

// collectSeedTargets lee todas las variables VAULT_SEED_* y construye la lista de targets.
func collectSeedTargets() []seedTarget {
	type envSpec struct {
		envKey   string
		channel  string
		category string
	}
	specs := []envSpec{
		{"VAULT_SEED_CAMI_MUSICA", "cami", "musica"},
		{"VAULT_SEED_CAMI_PELICULAS", "cami", "pelicula"},
		{"VAULT_SEED_CAMI_MUSICVIDEOS", "cami", "musicvideo"},
		{"VAULT_SEED_VARIADO_MUSICA", "variado", "musica"},
		{"VAULT_SEED_VARIADO_PELICULAS", "variado", "pelicula"},
		{"VAULT_SEED_VARIADO_MUSICVIDEOS", "variado", "musicvideo"},
	}

	var targets []seedTarget
	for _, sp := range specs {
		raw := strings.TrimSpace(os.Getenv(sp.envKey))
		if raw == "" {
			continue
		}
		ids := splitTargets(raw)
		if len(ids) > 0 {
			targets = append(targets, seedTarget{
				channel:  sp.channel,
				category: sp.category,
				ids:      ids,
			})
		}
	}
	return targets
}

// countMediaFiles cuenta archivos de media en un directorio (excluye archivos ocultos).
func countMediaFiles(dir string) int {
	entries, _ := os.ReadDir(dir)
	n := 0
	for _, e := range entries {
		if !e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
			if extensionesMedia[strings.ToLower(filepath.Ext(e.Name()))] {
				n++
			}
		}
	}
	return n
}

// resolveYtdlp busca el binario yt-dlp en orden de preferencia.
func resolveYtdlp() string {
	if p := strings.TrimSpace(os.Getenv("YTDLP_PATH")); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	for _, name := range []string{"./yt-dlp", "./yt-dlp.exe"} {
		if _, err := os.Stat(name); err == nil {
			return name
		}
	}
	if p, err := exec.LookPath("yt-dlp"); err == nil {
		return p
	}
	return ""
}

// isVideoID comprueba si el string es un ID de YouTube (11 caracteres).
func isVideoID(s string) bool {
	if len(s) != 11 {
		return false
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

// splitTargets divide y limpia una lista de IDs/URLs separados por comas.
func splitTargets(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// catToSubdir mapea category → nombre de subdirectorio en VAULT_ROOT.
func catToSubdir(category string) string {
	switch category {
	case "pelicula":
		return "peliculas"
	case "musicvideo":
		return "musicvideos"
	default:
		return "musica"
	}
}
