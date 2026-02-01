package auth

import (
	"testing"
)

func TestNew(t *testing.T) {
	s := New("secret")
	if s == nil {
		t.Fatal("New returned nil")
	}
}

func TestIssueToken_EmptyCredentials(t *testing.T) {
	s := New("test-secret")
	_, _, err := s.IssueToken("", "secret")
	if err != ErrInvalidCredentials {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
	_, _, err = s.IssueToken("client", "")
	if err != ErrInvalidCredentials {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestIssueToken_Valid(t *testing.T) {
	s := New("test-secret")
	token, exp, err := s.IssueToken("client-id", "client-secret")
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	if token == "" {
		t.Fatal("token is empty")
	}
	if exp.IsZero() {
		t.Fatal("exp is zero")
	}
	// Validar que el mismo servicio puede validar el token
	clientID, err := s.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if clientID != "client-id" {
		t.Errorf("clientID = %q, want client-id", clientID)
	}
}

func TestValidateToken_Invalid(t *testing.T) {
	s := New("test-secret")
	_, err := s.ValidateToken("invalid.jwt.here")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
	_, err = s.ValidateToken("")
	if err == nil {
		t.Fatal("expected error for empty token")
	}
}

func TestValidateToken_WrongSecret(t *testing.T) {
	s1 := New("secret1")
	s2 := New("secret2")
	token, _, err := s1.IssueToken("client", "pass")
	if err != nil {
		t.Fatal(err)
	}
	_, err = s2.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error when validating token with wrong secret")
	}
}
