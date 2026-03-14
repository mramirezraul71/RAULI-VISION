// Package store gestiona la base de datos SQLite local de Rauli Vision.
// Tablas:
//   - exchange_rates  — tasas de cambio informales USD/EUR/MLC en CUP
//   - rauli_digests   — histórico de resúmenes diarios por usuario
package store

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// ExchangeRate es una fila de la tabla exchange_rates.
type ExchangeRate struct {
	Currency    string
	BuyPrice    float64
	SellPrice   float64
	LastUpdated time.Time
}

// Digest es una fila de la tabla rauli_digests.
type Digest struct {
	ID          int64
	UserToken   string
	DigestText  string
	AudioURL    string
	CreatedDate string // YYYY-MM-DD
}

// DB encapsula la conexión SQLite y los prepared statements.
type DB struct {
	db *sql.DB
	mu sync.RWMutex
}

// Open abre (o crea) la base de datos SQLite en la ruta indicada.
func Open(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, fmt.Errorf("store: crear directorio: %w", err)
	}
	db, err := sql.Open("sqlite", path+"?_journal=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("store: abrir db: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite no soporta escrituras concurrentes
	s := &DB{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: migración: %w", err)
	}
	log.Printf("💾 Store SQLite abierto: %s", path)
	return s, nil
}

// Close cierra la base de datos.
func (s *DB) Close() error { return s.db.Close() }

// migrate aplica el esquema DDL inicial si las tablas no existen.
func (s *DB) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS exchange_rates (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			currency     TEXT    NOT NULL,
			buy_price    REAL    NOT NULL DEFAULT 0,
			sell_price   REAL    NOT NULL DEFAULT 0,
			source       TEXT    NOT NULL DEFAULT 'eltoque',
			last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(currency)
		);

		CREATE TABLE IF NOT EXISTS rauli_digests (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			user_token   TEXT    NOT NULL,
			digest_text  TEXT    NOT NULL,
			audio_url    TEXT    NOT NULL DEFAULT '',
			created_at   DATE    NOT NULL DEFAULT CURRENT_DATE,
			UNIQUE(user_token, created_at)
		);

		CREATE INDEX IF NOT EXISTS idx_digests_user_date
			ON rauli_digests(user_token, created_at);
	`)
	return err
}

// ── Exchange Rates ────────────────────────────────────────────────────────────

// UpsertRate inserta o actualiza la tasa de una divisa.
func (s *DB) UpsertRate(currency string, buy, sell float64, source string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`
		INSERT INTO exchange_rates(currency, buy_price, sell_price, source, last_updated)
		VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(currency) DO UPDATE SET
			buy_price    = excluded.buy_price,
			sell_price   = excluded.sell_price,
			source       = excluded.source,
			last_updated = CURRENT_TIMESTAMP
	`, currency, buy, sell, source)
	return err
}

// GetRate devuelve la tasa almacenada de una divisa, o un error si no existe.
func (s *DB) GetRate(currency string) (ExchangeRate, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	row := s.db.QueryRow(
		`SELECT currency, buy_price, sell_price, last_updated FROM exchange_rates WHERE currency = ?`,
		currency,
	)
	var r ExchangeRate
	var ts string
	if err := row.Scan(&r.Currency, &r.BuyPrice, &r.SellPrice, &ts); err != nil {
		return ExchangeRate{}, err
	}
	t, _ := time.Parse("2006-01-02 15:04:05", ts)
	r.LastUpdated = t
	return r, nil
}

// GetAllRates devuelve todas las tasas almacenadas, ordenadas por divisa.
func (s *DB) GetAllRates() ([]ExchangeRate, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query(
		`SELECT currency, buy_price, sell_price, last_updated FROM exchange_rates ORDER BY currency`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []ExchangeRate
	for rows.Next() {
		var r ExchangeRate
		var ts string
		if err := rows.Scan(&r.Currency, &r.BuyPrice, &r.SellPrice, &ts); err != nil {
			continue
		}
		t, _ := time.Parse("2006-01-02 15:04:05", ts)
		r.LastUpdated = t
		result = append(result, r)
	}
	return result, rows.Err()
}

// RatesStale devuelve true si alguna divisa de las requeridas no tiene dato
// reciente (más viejo que maxAge) o directamente no existe.
func (s *DB) RatesStale(currencies []string, maxAge time.Duration) bool {
	for _, c := range currencies {
		r, err := s.GetRate(c)
		if err != nil || time.Since(r.LastUpdated) > maxAge {
			return true
		}
	}
	return false
}

// ── Rauli Digests ─────────────────────────────────────────────────────────────

// GetDigestToday devuelve el resumen del día actual para un usuario.
// Devuelve sql.ErrNoRows si no hay resumen para hoy.
func (s *DB) GetDigestToday(userToken string) (Digest, error) {
	today := time.Now().Format("2006-01-02")
	s.mu.RLock()
	defer s.mu.RUnlock()
	row := s.db.QueryRow(
		`SELECT id, user_token, digest_text, audio_url, created_at
		 FROM rauli_digests WHERE user_token = ? AND created_at = ?`,
		userToken, today,
	)
	var d Digest
	err := row.Scan(&d.ID, &d.UserToken, &d.DigestText, &d.AudioURL, &d.CreatedDate)
	return d, err
}

// GetDigestGlobal devuelve el primer resumen creado hoy (cualquier usuario).
// Útil como caché compartido cuando no se distingue al usuario.
func (s *DB) GetDigestGlobal() (Digest, error) {
	today := time.Now().Format("2006-01-02")
	s.mu.RLock()
	defer s.mu.RUnlock()
	row := s.db.QueryRow(
		`SELECT id, user_token, digest_text, audio_url, created_at
		 FROM rauli_digests WHERE created_at = ? ORDER BY id ASC LIMIT 1`,
		today,
	)
	var d Digest
	err := row.Scan(&d.ID, &d.UserToken, &d.DigestText, &d.AudioURL, &d.CreatedDate)
	return d, err
}

// SaveDigest guarda un nuevo resumen diario para el usuario.
// Usa INSERT OR IGNORE para no duplicar si ya existe.
func (s *DB) SaveDigest(userToken, text, audioURL string) error {
	today := time.Now().Format("2006-01-02")
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`
		INSERT OR IGNORE INTO rauli_digests(user_token, digest_text, audio_url, created_at)
		VALUES(?, ?, ?, ?)
	`, userToken, text, audioURL, today)
	return err
}

// ListDigests devuelve los últimos N resúmenes de un usuario (más reciente primero).
func (s *DB) ListDigests(userToken string, limit int) ([]Digest, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query(
		`SELECT id, user_token, digest_text, audio_url, created_at
		 FROM rauli_digests WHERE user_token = ?
		 ORDER BY created_at DESC LIMIT ?`,
		userToken, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []Digest
	for rows.Next() {
		var d Digest
		if err := rows.Scan(&d.ID, &d.UserToken, &d.DigestText, &d.AudioURL, &d.CreatedDate); err != nil {
			continue
		}
		result = append(result, d)
	}
	return result, rows.Err()
}
