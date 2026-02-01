package video

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

type VideoMeta struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Channel     string   `json:"channel"`
	DurationSec int      `json:"duration_sec"`
	Qualities   []string `json:"qualities"`
	Ready       bool     `json:"ready"`
}

type SearchItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Channel     string `json:"channel"`
	DurationSec int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
}

type JobStatus struct {
	JobID          string  `json:"job_id"`
	Status         string  `json:"status"`
	ProgressPercent int    `json:"progress_percent"`
	Error          *string `json:"error,omitempty"`
}

type Service struct {
	mu    sync.RWMutex
	jobs  map[string]string
	ready map[string]bool
}

func New() *Service {
	return &Service{
		jobs:  make(map[string]string),
		ready: make(map[string]bool),
	}
}

func (s *Service) Search(q string, max int) ([]SearchItem, error) {
	if max <= 0 {
		max = 15
	}
	items := make([]SearchItem, 0, max)
	for i := 0; i < max; i++ {
		items = append(items, SearchItem{
			ID:          fmt.Sprintf("yt_%s_%d", q, i+1),
			Title:       "Video de ejemplo: " + q + " #" + fmt.Sprint(i+1),
			Channel:     "Canal ejemplo",
			DurationSec: 120 + i*60,
		})
	}
	return items, nil
}

func (s *Service) Meta(id string) (VideoMeta, bool) {
	s.mu.RLock()
	ready := s.ready[id]
	s.mu.RUnlock()
	return VideoMeta{
		ID:          id,
		Title:       "Video: " + id,
		Channel:     "Canal",
		DurationSec: 180,
		Qualities:   []string{"240p", "360p"},
		Ready:       ready,
	}, true
}

func (s *Service) Request(id, quality string) (jobID string, status string, err error) {
	jobID = uuid.New().String()
	s.mu.Lock()
	s.jobs[jobID] = id
	s.mu.Unlock()
	go s.simulateJob(jobID, id)
	return jobID, "pending", nil
}

func (s *Service) simulateJob(jobID, videoID string) {
	time.Sleep(3 * time.Second)
	s.mu.Lock()
	s.ready[videoID] = true
	delete(s.jobs, jobID)
	s.mu.Unlock()
}

func (s *Service) Status(jobID, videoID string) (JobStatus, bool) {
	s.mu.RLock()
	id, exists := s.jobs[jobID]
	ready := s.ready[videoID]
	s.mu.RUnlock()
	if !exists && ready {
		return JobStatus{JobID: jobID, Status: "ready", ProgressPercent: 100}, true
	}
	if !exists {
		return JobStatus{JobID: jobID, Status: "pending", ProgressPercent: 0}, true
	}
	if id != videoID {
		return JobStatus{}, false
	}
	return JobStatus{JobID: jobID, Status: "processing", ProgressPercent: 50}, true
}

func (s *Service) SearchJSON(q string, max int) ([]byte, error) {
	items, err := s.Search(q, max)
	if err != nil {
		return nil, err
	}
	type out struct {
		Results []SearchItem `json:"results"`
		Cached  bool          `json:"cached"`
	}
	return json.Marshal(out{Results: items, Cached: false})
}
