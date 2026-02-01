# RAULI-VISION — Código completo con nombres de carpeta

Estructura y código fuente (sin `node_modules` ni `dist`).

---

## Estructura de carpetas

```
RAULI-VISION/
├── .gitignore
├── README.md
├── espejo/
│   ├── go.mod
│   ├── README.md
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   └── internal/
│       ├── api/
│       │   ├── brotli.go
│       │   ├── handlers.go
│       │   └── routes.go
│       ├── auth/
│       │   └── auth.go
│       ├── chat/
│       │   └── chat.go
│       ├── search/
│       │   └── search.go
│       └── video/
│           └── video.go
├── cliente-local/
│   ├── go.mod
│   ├── README.md
│   ├── cmd/
│   │   └── proxy/
│   │       └── main.go
│   ├── internal/
│   │   ├── api/
│   │   │   └── proxy.go
│   │   └── cache/
│   │       └── cache.go
│   └── static/
│       └── index.html
├── dashboard/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   └── favicon.svg
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── vite-env.d.ts
│       ├── api/
│       │   └── client.ts
│       ├── components/
│       │   └── ErrorBoundary.tsx
│       └── pages/
│           ├── SearchPage.tsx
│           ├── VideoPage.tsx
│           └── ChatPage.tsx
├── scripts/
│   ├── run-all.ps1
│   ├── run-espejo.ps1
│   ├── run-proxy.ps1
│   ├── run-dashboard-dev.ps1
│   └── build-dashboard-and-copy.ps1
└── docs/
    └── (documentación)
```

---

## espejo/go.mod

```go
module github.com/rauli-vision/espejo

go 1.22

require (
	github.com/golang-jwt/jwt/v5 v5.2.0
	github.com/andybalholm/brotli v1.0.6
	github.com/google/uuid v1.6.0
)
```

---

## espejo/cmd/server/main.go

```go
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/rauli-vision/espejo/internal/api"
	"github.com/rauli-vision/espejo/internal/auth"
	"github.com/rauli-vision/espejo/internal/chat"
	"github.com/rauli-vision/espejo/internal/search"
	"github.com/rauli-vision/espejo/internal/video"
)

func main() {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "rauli-vision-espejo-default-secret-change-in-production"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	authSvc := auth.New(jwtSecret)
	searchSvc := search.New()
	videoSvc := video.New()
	chatSvc := chat.New()

	mux := http.NewServeMux()
	api.Register(mux, authSvc, searchSvc, videoSvc, chatSvc)

	addr := ":" + port
	log.Printf("Espejo escuchando en %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
```

---

## espejo/internal/auth/auth.go

```go
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
```

---

## espejo/internal/api/brotli.go

```go
package api

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"

	"github.com/andybalholm/brotli"
)

func brotliMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ae := r.Header.Get("Accept-Encoding")
		if strings.Contains(ae, "br") {
			bw := brotli.NewWriterLevel(w, brotli.BestSpeed)
			defer bw.Close()
			w.Header().Set("Content-Encoding", "br")
			w = &responseWriter{Writer: bw, ResponseWriter: w, status: http.StatusOK}
		} else if strings.Contains(ae, "gzip") {
			gw := gzip.NewWriter(w)
			defer gw.Close()
			w.Header().Set("Content-Encoding", "gzip")
			w = &responseWriter{Writer: gw, ResponseWriter: w, status: http.StatusOK}
		}
		next(w, r)
	}
}

type responseWriter struct {
	io.Writer
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}
```

---

## espejo/internal/api/handlers.go

(Véase el archivo en el repo; ~200 líneas: PostAuthToken, GetHealth, GetSearch, GetVideoSearch, GetVideoMeta, PostVideoRequest, GetVideoStream, GetVideoStatus, PostChat, GetChatHistory, writeJSON.)

---

## espejo/internal/api/routes.go

(Véase el archivo en el repo; registro de rutas, serveVideo, serveVideoPost, optionalAuth.)

---

## espejo/internal/search/search.go

(Véase el archivo en el repo; API DuckDuckGo JSON + HTML + fallback, Search, SearchJSON.)

---

## espejo/internal/video/video.go

(Véase el archivo en el repo; Search, Meta, Request, Status, SearchJSON, simulateJob.)

---

## espejo/internal/chat/chat.go

(Véase el archivo en el repo; Chat, AddToHistory, History, ChatJSON, HistoryJSON.)

---

## cliente-local/go.mod

```go
module github.com/rauli-vision/cliente-local

go 1.22

require (
	github.com/andybalholm/brotli v1.0.6
	github.com/golang-jwt/jwt/v5 v5.2.0
	github.com/mattn/go-sqlite3 v1.14.22
)
```

---

## cliente-local/cmd/proxy/main.go

```go
package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"

	"github.com/rauli-vision/cliente-local/internal/api"
	"github.com/rauli-vision/cliente-local/internal/cache"
)

//go:embed static/*
var staticFS embed.FS

func main() {
	espejoURL := os.Getenv("ESPEJO_URL")
	if espejoURL == "" {
		espejoURL = "http://localhost:8080"
	}
	clientID := os.Getenv("CLIENT_ID")
	clientSecret := os.Getenv("CLIENT_SECRET")
	if clientID == "" {
		clientID = "rauli-local"
	}
	if clientSecret == "" {
		clientSecret = "rauli-local-secret"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	dbPath := os.Getenv("CACHE_DB")
	if dbPath == "" {
		dbPath = "rauli-cache.db"
	}

	c, err := cache.New(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer c.Close()

	staticRoot, _ := fs.Sub(staticFS, "static")
	handler := api.NewProxy(espejoURL, clientID, clientSecret, c, http.FS(staticRoot))

	addr := ":" + port
	log.Printf("Cliente local (proxy) escuchando en %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
```

---

## cliente-local/internal/api/proxy.go

(Véase el archivo en el repo; ServeHTTP, serveStatic, serveAPI, getToken, fallback búsqueda/video cuando espejo no responde.)

---

## cliente-local/internal/cache/cache.go

(Véase el archivo en el repo; New, Get, Set, Close, CacheKey, SQLite.)

---

## cliente-local/static/index.html

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RAULI-VISION</title>
<style>
:root{--bg:#0d1117;--text:#e6edf3;--accent:#58a6ff;}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;}
h1{color:var(--accent);}
a{color:var(--accent);}
#status{margin-top:1rem;padding:0.5rem 1rem;border-radius:8px;font-size:0.9rem;}
#status.ok{background:rgba(63,185,80,0.2);color:#3fb950;}
#status.err{background:rgba(248,81,73,0.2);color:#f85149;}
</style>
</head>
<body>
<h1>RAULI-VISION</h1>
<p>Cliente local activo. Dashboard embebido.</p>
<p><a href="/api/health">Ver estado API</a></p>
<div id="status"></div>
<script>
fetch('/api/health').then(r=>r.json()).then(d=>{
  document.getElementById('status').textContent = 'API: ' + (d.status||d.proxy||'ok');
  document.getElementById('status').className = 'ok';
}).catch(()=>{
  document.getElementById('status').textContent = 'No se pudo conectar a la API';
  document.getElementById('status').className = 'err';
});
</script>
</body>
</html>
```

---

## dashboard/package.json

```json
{
  "name": "rauli-vision-dashboard",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.17.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.45",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.10",
    "vite-plugin-pwa": "^0.17.4"
  }
}
```

---

## dashboard/index.html

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0d1117" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>RAULI-VISION</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

---

## dashboard/vite.config.ts

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
      manifest: {
        name: 'RAULI-VISION',
        short_name: 'RAULI-VISION',
        description: 'Dashboard unificado para entornos de bajo ancho de banda',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:3000', '/auth': 'http://localhost:3000' } },
})
```

---

## dashboard/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

---

## dashboard/tailwind.config.js

```js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d1117',
        surface: 'rgba(22, 27, 34, 0.85)',
        accent: '#58a6ff',
        muted: '#8b949e',
        success: '#3fb950',
      },
    },
  },
  plugins: [],
}
```

---

## dashboard/src/main.tsx

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, retry: 2 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

---

## dashboard/src/App.tsx

(Véase el archivo en el repo; tabs Búsqueda/Video/IA, header, tagline, footer, ErrorBoundary.)

---

## dashboard/src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0d1117;
  color: #e6edf3;
  min-height: 100vh;
}
```

---

## dashboard/src/api/client.ts

(Véase el archivo en el repo; getHealth, search, videoSearch, videoMeta, videoRequest, videoStatus, chat, chatHistory.)

---

## dashboard/src/components/ErrorBoundary.tsx

(Véase el archivo en el repo; getDerivedStateFromError, componentDidCatch, render con Reintentar.)

---

## dashboard/src/pages/SearchPage.tsx

(Véase el archivo en el repo; formulario búsqueda, useQuery search, Skeleton, resultados, mensaje de error.)

---

## dashboard/src/pages/VideoPage.tsx

(Véase el archivo en el repo; búsqueda video, lista, meta, request, status, refetchInterval.)

---

## dashboard/src/pages/ChatPage.tsx

(Véase el archivo en el repo; formulario mensaje + context_url, mutation chat, historial.)

---

## dashboard/src/vite-env.d.ts

```ts
/// <reference types="vite/client" />
```

---

## scripts/run-all.ps1

```powershell
# Inicia Espejo (8080) y Proxy (3000) en ventanas nuevas. Abre el navegador al proxy.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path

Write-Host "Abriendo Espejo (puerto 8080) y Proxy (puerto 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\espejo'; `$env:PORT='8080'; `$env:JWT_SECRET='rauli-vision-espejo-secret'; go run ./cmd/server"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\cliente-local'; `$env:PORT='3000'; `$env:ESPEJO_URL='http://localhost:8080'; `$env:CLIENT_ID='rauli-local'; `$env:CLIENT_SECRET='rauli-local-secret'; go run ./cmd/proxy"
Start-Sleep -Seconds 4
Write-Host "Dashboard: http://localhost:3000" -ForegroundColor Green
Start-Process "http://localhost:3000"
```

---

## scripts/build-dashboard-and-copy.ps1

```powershell
# Build dashboard React y copiar a cliente-local/static para servir desde el proxy
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\dashboard"
if (-not (Test-Path "node_modules")) { npm install }
npm run build
if (-not (Test-Path "dist")) { Write-Error "Build no generó dist/" }
Remove-Item "$root\cliente-local\static\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Recurse "dist\*" "$root\cliente-local\static\"
Write-Host "Dashboard construido y copiado a cliente-local/static" -ForegroundColor Green
Set-Location $root
```

---

## .gitignore

```
# RAULI-VISION
*.zip
*.jks
key.properties
.env
credenciales.txt
*.db
*.db-wal
*.db-shm

# Go
espejo/espejo
cliente-local/rauli-proxy
cliente-local/rauli-proxy.exe
cliente-local/*.db

# Node / Dashboard
dashboard/node_modules
dashboard/dist
dashboard/.vite

# IDE / OS
.idea
.vscode
*.swp
.DS_Store
Thumbs.db

# Temp
_zip_check
_zip_original
```

---

Para ver el código completo de cada archivo, abra la ruta indicada en el árbol (p. ej. `espejo/internal/api/handlers.go`, `dashboard/src/App.tsx`) en el repositorio.
