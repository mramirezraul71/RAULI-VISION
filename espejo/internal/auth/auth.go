package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidCredentials = errors.New("credenciales inválidas")

type Service struct {
	secret []byte
}

func New(secret string) *Service {
	return &Service{secret: []byte(secret)}
}

type Claims struct {
	ClientID string `json:"client_id"`
	jwt.RegisteredClaims
}

func (s *Service) IssueToken(clientID, clientSecret string) (string, time.Time, error) {
	if clientID == "" || clientSecret == "" {
		return "", time.Time{}, ErrInvalidCredentials
	}
	exp := time.Now().Add(time.Hour)
	claims := Claims{
		ClientID: clientID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secret)
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, exp, nil
}

func (s *Service) ValidateToken(tokenString string) (clientID string, err error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return s.secret, nil
	})
	if err != nil {
		return "", err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims.ClientID, nil
	}
	return "", errors.New("token inválido")
}
