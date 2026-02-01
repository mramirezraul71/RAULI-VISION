package cami

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Song struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Artist      string    `json:"artist"`
	Duration    string    `json:"duration"`
	UploadDate  string    `json:"uploadDate"`
	FileSize    string    `json:"fileSize"`
	Format      string    `json:"format"`
	Status      string    `json:"status"`
	Plays       int       `json:"plays"`
	Genre       *string   `json:"genre,omitempty"`
	Album       *string   `json:"album,omitempty"`
	Explicit    bool      `json:"explicit"`
	TrackNumber *int      `json:"trackNumber,omitempty"`
	ReleaseDate *string   `json:"releaseDate,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Album struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Artist      string    `json:"artist"`
	ReleaseDate string    `json:"releaseDate"`
	CoverImage  string    `json:"coverImage"`
	SongCount   int       `json:"songCount"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type ChannelStats struct {
	TotalSongs       int `json:"totalSongs"`
	TotalAlbums      int `json:"totalAlbums"`
	TotalPlays       int `json:"totalPlays"`
	EngagementRate   int `json:"engagementRate"`
	MonthlyListeners int `json:"monthlyListeners"`
}

type Service struct {
	songs  map[string]Song
	albums map[string]Album
	mu     sync.RWMutex
}

func New() *Service {
	s := &Service{
		songs:  make(map[string]Song),
		albums: make(map[string]Album),
	}
	
	// Initialize with sample data
	s.initializeSampleData()
	
	return s
}

func (s *Service) initializeSampleData() {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	// Sample songs
	songs := []Song{
		{
			ID:         "1",
			Title:      "Mi Primera Canción",
			Artist:     "CAMI",
			Duration:   "3:45",
			UploadDate: "2024-01-15",
			FileSize:   "8.2 MB",
			Format:     "MP3",
			Status:     "published",
			Plays:      1250,
			Genre:      stringPtr("Pop"),
			Album:      stringPtr("Debut Album"),
			Explicit:   false,
			TrackNumber: intPtr(1),
			ReleaseDate: stringPtr("2024-02-01"),
			CreatedAt:  time.Now().AddDate(0, -1, 0),
			UpdatedAt:  time.Now().AddDate(0, -1, 0),
		},
		{
			ID:         "2",
			Title:      "Noches de Luna",
			Artist:     "CAMI",
			Duration:   "4:12",
			UploadDate: "2024-01-20",
			FileSize:   "9.1 MB",
			Format:     "MP3",
			Status:     "published",
			Plays:      890,
			Genre:      stringPtr("Balada"),
			Album:      stringPtr("Debut Album"),
			Explicit:   false,
			TrackNumber: intPtr(2),
			ReleaseDate: stringPtr("2024-02-01"),
			CreatedAt:  time.Now().AddDate(0, -1, 0),
			UpdatedAt:  time.Now().AddDate(0, -1, 0),
		},
		{
			ID:         "3",
			Title:      "Demo Nueva",
			Artist:     "CAMI",
			Duration:   "3:20",
			UploadDate: "2024-01-25",
			FileSize:   "7.5 MB",
			Format:     "WAV",
			Status:     "draft",
			Plays:      0,
			Genre:      stringPtr("Pop"),
			Album:      nil,
			Explicit:   false,
			TrackNumber: nil,
			ReleaseDate: nil,
			CreatedAt:  time.Now().AddDate(0, -1, 0),
			UpdatedAt:  time.Now().AddDate(0, -1, 0),
		},
	}
	
	for _, song := range songs {
		s.songs[song.ID] = song
	}
	
	// Sample albums
	albums := []Album{
		{
			ID:          "1",
			Title:       "Debut Album",
			Artist:      "CAMI",
			ReleaseDate: "2024-02-01",
			CoverImage:  "/api/placeholder/300/300",
			SongCount:   12,
			Status:      "published",
			CreatedAt:   time.Now().AddDate(0, -1, 0),
			UpdatedAt:   time.Now().AddDate(0, -1, 0),
		},
	}
	
	for _, album := range albums {
		s.albums[album.ID] = album
	}
}

func stringPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}

func (s *Service) GetSongs() []Song {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	songs := make([]Song, 0, len(s.songs))
	for _, song := range s.songs {
		songs = append(songs, song)
	}
	return songs
}

func (s *Service) GetSong(id string) (Song, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	song, exists := s.songs[id]
	return song, exists
}

func (s *Service) CreateSong(song Song) (Song, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if song.ID == "" {
		song.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	
	song.CreatedAt = time.Now()
	song.UpdatedAt = time.Now()
	
	s.songs[song.ID] = song
	return song, nil
}

func (s *Service) UpdateSong(id string, updates Song) (Song, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	song, exists := s.songs[id]
	if !exists {
		return Song{}, fmt.Errorf("song not found")
	}
	
	// Update fields
	if updates.Title != "" {
		song.Title = updates.Title
	}
	if updates.Artist != "" {
		song.Artist = updates.Artist
	}
	if updates.Duration != "" {
		song.Duration = updates.Duration
	}
	if updates.FileSize != "" {
		song.FileSize = updates.FileSize
	}
	if updates.Format != "" {
		song.Format = updates.Format
	}
	if updates.Status != "" {
		song.Status = updates.Status
	}
	if updates.Genre != nil {
		song.Genre = updates.Genre
	}
	if updates.Album != nil {
		song.Album = updates.Album
	}
	if updates.TrackNumber != nil {
		song.TrackNumber = updates.TrackNumber
	}
	if updates.ReleaseDate != nil {
		song.ReleaseDate = updates.ReleaseDate
	}
	
	song.UpdatedAt = time.Now()
	s.songs[id] = song
	
	return song, nil
}

func (s *Service) DeleteSong(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if _, exists := s.songs[id]; !exists {
		return fmt.Errorf("song not found")
	}
	
	delete(s.songs, id)
	return nil
}

func (s *Service) GetAlbums() []Album {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	albums := make([]Album, 0, len(s.albums))
	for _, album := range s.albums {
		albums = append(albums, album)
	}
	return albums
}

func (s *Service) GetAlbum(id string) (Album, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	album, exists := s.albums[id]
	return album, exists
}

func (s *Service) CreateAlbum(album Album) (Album, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if album.ID == "" {
		album.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	
	album.CreatedAt = time.Now()
	album.UpdatedAt = time.Now()
	
	s.albums[album.ID] = album
	return album, nil
}

func (s *Service) GetChannelStats() ChannelStats {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	totalPlays := 0
	for _, song := range s.songs {
		totalPlays += song.Plays
	}
	
	return ChannelStats{
		TotalSongs:       len(s.songs),
		TotalAlbums:      len(s.albums),
		TotalPlays:       totalPlays,
		EngagementRate:   98, // Mock data
		MonthlyListeners: 15420, // Mock data
	}
}

// HTTP Handlers
func (s *Service) HandleGetSongs(w http.ResponseWriter, r *http.Request) {
	songs := s.GetSongs()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(songs)
}

func (s *Service) HandleGetSong(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/cami/songs/")
	
	song, exists := s.GetSong(id)
	if !exists {
		http.Error(w, "Song not found", http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(song)
}

func (s *Service) HandleCreateSong(w http.ResponseWriter, r *http.Request) {
	var song Song
	if err := json.NewDecoder(r.Body).Decode(&song); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	created, err := s.CreateSong(song)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (s *Service) HandleUpdateSong(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/cami/songs/")
	
	var updates Song
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	updated, err := s.UpdateSong(id, updates)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

func (s *Service) HandleDeleteSong(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/cami/songs/")
	
	if err := s.DeleteSong(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) HandleGetAlbums(w http.ResponseWriter, r *http.Request) {
	albums := s.GetAlbums()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(albums)
}

func (s *Service) HandleGetAlbum(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/cami/albums/")
	
	album, exists := s.GetAlbum(id)
	if !exists {
		http.Error(w, "Album not found", http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(album)
}

func (s *Service) HandleCreateAlbum(w http.ResponseWriter, r *http.Request) {
	var album Album
	if err := json.NewDecoder(r.Body).Decode(&album); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	created, err := s.CreateAlbum(album)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (s *Service) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	stats := s.GetChannelStats()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (s *Service) HandlePlaySong(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/cami/songs/")
	id = strings.TrimSuffix(id, "/play")
	
	song, exists := s.GetSong(id)
	if !exists {
		http.Error(w, "Song not found", http.StatusNotFound)
		return
	}
	
	// Increment play count
	song.Plays++
	s.UpdateSong(id, song)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"plays":   song.Plays,
	})
}

func (s *Service) HandleSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Query parameter 'q' is required", http.StatusBadRequest)
		return
	}
	
	songs := s.GetSongs()
	var results []Song
	
	query = strings.ToLower(query)
	for _, song := range songs {
		if strings.Contains(strings.ToLower(song.Title), query) ||
		   strings.Contains(strings.ToLower(song.Artist), query) ||
		   (song.Genre != nil && strings.Contains(strings.ToLower(*song.Genre), query)) ||
		   (song.Album != nil && strings.Contains(strings.ToLower(*song.Album), query)) {
			results = append(results, song)
		}
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"query":   query,
		"results": results,
		"total":   len(results),
	})
}

func (s *Service) HandleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	// Parse multipart form (max 50MB)
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}
	
	file, handler, err := r.FormFile("audio")
	if err != nil {
		http.Error(w, "No audio file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()
	
	// Get form data
	title := r.FormValue("title")
	artist := r.FormValue("artist")
	genre := r.FormValue("genre")
	album := r.FormValue("album")
	status := r.FormValue("status")
	explicitStr := r.FormValue("explicit")
	
	explicit := explicitStr == "true"
	
	// Create song record
	song := Song{
		Title:      title,
		Artist:     artist,
		FileSize:   fmt.Sprintf("%.1f MB", float64(handler.Size)/1024/1024),
		Format:     strings.ToUpper(handler.Filename[strings.LastIndex(handler.Filename, ".")+1:]),
		Status:     status,
		UploadDate: time.Now().Format("2006-01-02"),
		Explicit:   explicit,
		Plays:      0,
	}
	
	if genre != "" {
		song.Genre = &genre
	}
	if album != "" {
		song.Album = &album
	}
	
	created, err := s.CreateSong(song)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	log.Printf("Uploaded song: %s (%s)", created.Title, created.FileSize)
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (s *Service) HandleGetPopularSongs(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 10
	
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	
	songs := s.GetSongs()
	
	// Sort by plays (descending)
	for i := 0; i < len(songs)-1; i++ {
		for j := i + 1; j < len(songs); j++ {
			if songs[i].Plays < songs[j].Plays {
				songs[i], songs[j] = songs[j], songs[i]
			}
		}
	}
	
	if len(songs) > limit {
		songs = songs[:limit]
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(songs)
}
