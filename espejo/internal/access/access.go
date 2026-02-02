package access

import (
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	RequestPending  = "pending"
	RequestApproved = "approved"
	RequestRejected = "rejected"

	UserActive   = "active"
	UserDisabled = "disabled"
)

type AccessRequest struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Role         string     `json:"role,omitempty"`
	Organization string     `json:"organization,omitempty"`
	Message      string     `json:"message,omitempty"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	DecisionAt   *time.Time `json:"decision_at,omitempty"`
	DecisionBy   string     `json:"decision_by,omitempty"`
	DecisionNote string     `json:"decision_note,omitempty"`
	RequesterIP  string     `json:"requester_ip,omitempty"`
	UserAgent    string     `json:"user_agent,omitempty"`
}

type AccessUser struct {
	ID           string     `json:"id"`
	RequestID    string     `json:"request_id,omitempty"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Role         string     `json:"role,omitempty"`
	Organization string     `json:"organization,omitempty"`
	Status       string     `json:"status"`
	AccessCode   string     `json:"access_code"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	ActivatedAt  *time.Time `json:"activated_at,omitempty"`
	DisabledAt   *time.Time `json:"disabled_at,omitempty"`
	ApprovedBy   string     `json:"approved_by,omitempty"`
}

type Store struct {
	Version   int                      `json:"version"`
	Requests  map[string]AccessRequest `json:"requests"`
	Users     map[string]AccessUser    `json:"users"`
	UpdatedAt time.Time                `json:"updated_at"`
}

type RequestInput struct {
	Name         string
	Email        string
	Role         string
	Organization string
	Message      string
	RequesterIP  string
	UserAgent    string
}

type Service struct {
	mu    sync.RWMutex
	path  string
	store Store
}

func New(path string) (*Service, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("ruta de almacenamiento de accesos vacía")
	}
	service := &Service{path: path}
	if err := service.load(); err != nil {
		return nil, err
	}
	return service, nil
}

func (s *Service) CreateRequest(input RequestInput) (AccessRequest, error) {
	name := strings.TrimSpace(input.Name)
	email := strings.TrimSpace(input.Email)
	role := strings.TrimSpace(input.Role)
	org := strings.TrimSpace(input.Organization)
	message := strings.TrimSpace(input.Message)

	if name == "" {
		return AccessRequest{}, errors.New("nombre requerido")
	}
	if !isValidEmail(email) {
		return AccessRequest{}, errors.New("correo inválido")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, user := range s.store.Users {
		if strings.EqualFold(user.Email, email) {
			return AccessRequest{}, errors.New("el usuario ya está registrado")
		}
	}
	for _, req := range s.store.Requests {
		if !strings.EqualFold(req.Email, email) {
			continue
		}
		switch req.Status {
		case RequestPending:
			return AccessRequest{}, errors.New("ya existe una solicitud en revisión")
		case RequestApproved:
			return AccessRequest{}, errors.New("la solicitud ya fue aprobada; contacte al administrador")
		}
	}

	now := time.Now().UTC()
	request := AccessRequest{
		ID:           newID("req"),
		Name:         name,
		Email:        email,
		Role:         role,
		Organization: org,
		Message:      message,
		Status:       RequestPending,
		CreatedAt:    now,
		UpdatedAt:    now,
		RequesterIP:  strings.TrimSpace(input.RequesterIP),
		UserAgent:    strings.TrimSpace(input.UserAgent),
	}

	s.store.Requests[request.ID] = request
	if err := s.saveLocked(); err != nil {
		return AccessRequest{}, err
	}
	return request, nil
}

func (s *Service) ListRequests(status string) []AccessRequest {
	status = strings.TrimSpace(strings.ToLower(status))
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]AccessRequest, 0, len(s.store.Requests))
	for _, req := range s.store.Requests {
		if status != "" && strings.ToLower(req.Status) != status {
			continue
		}
		out = append(out, req)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

func (s *Service) ListUsers(status string) []AccessUser {
	status = strings.TrimSpace(strings.ToLower(status))
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]AccessUser, 0, len(s.store.Users))
	for _, user := range s.store.Users {
		if status != "" && strings.ToLower(user.Status) != status {
			continue
		}
		out = append(out, user)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

func (s *Service) ApproveRequest(id, note, decidedBy string) (AccessRequest, AccessUser, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return AccessRequest{}, AccessUser{}, errors.New("id requerido")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	req, ok := s.store.Requests[id]
	if !ok {
		return AccessRequest{}, AccessUser{}, errors.New("solicitud no encontrada")
	}
	if req.Status == RequestApproved {
		user, ok := s.findUserByRequestLocked(req.ID)
		if !ok {
			return req, AccessUser{}, errors.New("usuario aprobado no encontrado")
		}
		return req, user, nil
	}

	now := time.Now().UTC()
	req.Status = RequestApproved
	req.DecisionAt = &now
	req.DecisionBy = strings.TrimSpace(decidedBy)
	req.DecisionNote = strings.TrimSpace(note)
	req.UpdatedAt = now

	accessCode, err := newAccessCode()
	if err != nil {
		return AccessRequest{}, AccessUser{}, err
	}
	user := AccessUser{
		ID:           newID("usr"),
		RequestID:    req.ID,
		Name:         req.Name,
		Email:        req.Email,
		Role:         req.Role,
		Organization: req.Organization,
		Status:       UserActive,
		AccessCode:   accessCode,
		CreatedAt:    now,
		UpdatedAt:    now,
		ActivatedAt:  &now,
		ApprovedBy:   strings.TrimSpace(decidedBy),
	}

	s.store.Requests[req.ID] = req
	s.store.Users[user.ID] = user
	if err := s.saveLocked(); err != nil {
		return AccessRequest{}, AccessUser{}, err
	}
	return req, user, nil
}

func (s *Service) RejectRequest(id, note, decidedBy string) (AccessRequest, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return AccessRequest{}, errors.New("id requerido")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	req, ok := s.store.Requests[id]
	if !ok {
		return AccessRequest{}, errors.New("solicitud no encontrada")
	}
	if req.Status == RequestRejected {
		return req, nil
	}

	now := time.Now().UTC()
	req.Status = RequestRejected
	req.DecisionAt = &now
	req.DecisionBy = strings.TrimSpace(decidedBy)
	req.DecisionNote = strings.TrimSpace(note)
	req.UpdatedAt = now

	s.store.Requests[req.ID] = req
	if err := s.saveLocked(); err != nil {
		return AccessRequest{}, err
	}
	return req, nil
}

func (s *Service) SetUserStatus(id, status string) (AccessUser, error) {
	id = strings.TrimSpace(id)
	status = strings.TrimSpace(strings.ToLower(status))
	if id == "" {
		return AccessUser{}, errors.New("id requerido")
	}
	if status != UserActive && status != UserDisabled {
		return AccessUser{}, errors.New("estado inválido")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	user, ok := s.store.Users[id]
	if !ok {
		return AccessUser{}, errors.New("usuario no encontrado")
	}
	if user.Status == status {
		return user, nil
	}

	now := time.Now().UTC()
	user.Status = status
	user.UpdatedAt = now
	if status == UserDisabled {
		user.DisabledAt = &now
	} else {
		user.ActivatedAt = &now
		user.DisabledAt = nil
	}

	s.store.Users[user.ID] = user
	if err := s.saveLocked(); err != nil {
		return AccessUser{}, err
	}
	return user, nil
}

func (s *Service) load() error {
	s.store = Store{
		Version:   1,
		Requests:  map[string]AccessRequest{},
		Users:     map[string]AccessUser{},
		UpdatedAt: time.Now().UTC(),
	}

	file, err := os.Open(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&s.store); err != nil {
		return err
	}
	if s.store.Requests == nil {
		s.store.Requests = map[string]AccessRequest{}
	}
	if s.store.Users == nil {
		s.store.Users = map[string]AccessUser{}
	}
	return nil
}

func (s *Service) saveLocked() error {
	s.store.UpdatedAt = time.Now().UTC()
	data, err := json.MarshalIndent(s.store, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}

	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *Service) findUserByRequestLocked(requestID string) (AccessUser, bool) {
	for _, user := range s.store.Users {
		if user.RequestID == requestID {
			return user, true
		}
	}
	return AccessUser{}, false
}

func newID(prefix string) string {
	buf := make([]byte, 5)
	_, _ = rand.Read(buf)
	token := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf))
	return fmt.Sprintf("%s_%s_%s", prefix, time.Now().UTC().Format("20060102"), token)
}

func newAccessCode() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return strings.ToUpper(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf)), nil
}

func isValidEmail(email string) bool {
	if email == "" {
		return false
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return false
	}
	if len(parts[0]) < 1 || len(parts[1]) < 3 {
		return false
	}
	return strings.Contains(parts[1], ".")
}
