# RAULI-VISION — Estructura de repos y carpetas

**Alcance:** Organización del código en tres componentes (Espejo, Cliente local, Dashboard) y decisión monorepo vs multirepo.

---

## 1. Opción recomendada: monorepo único

Un solo repositorio **RAULI-VISION** con tres carpetas raíz (o tres “paquetes”) permite:

- Versionado y releases coordinados (ej. `v1.2.0` = espejo + proxy + dashboard).
- Documentación y arquitectura en un solo lugar (como ya está en `docs/`).
- CI único: build y tests de los tres componentes en un pipeline.
- Menos fricción para desarrolladores que tocan más de un componente.

**Estructura propuesta:**

```
RAULI-VISION/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint, test, build de espejo + proxy + dashboard
│       └── release.yml        # (opcional) build de binarios y deploy
├── docs/                      # Documentación (ya existente)
│   ├── ARQUITECTURA_RAULI-VISION.md
│   ├── API_RAULI-VISION.md
│   ├── ESTRUCTURA_REPOS_RAULI-VISION.md
│   └── ...
├── espejo/                    # Servidor espejo (VPS exterior)
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   ├── internal/
│   │   ├── api/               # Handlers HTTP, middleware
│   │   ├── auth/              # JWT, validación de clientes
│   │   ├── search/            # Scraping + readability
│   │   ├── video/             # yt-dlp, ffmpeg, cola Redis
│   │   ├── chat/              # Integración LLM
│   │   └── cache/             # Redis o in-memory
│   ├── pkg/                   # Utilidades reutilizables (opcional)
│   ├── go.mod
│   ├── go.sum
│   ├── Dockerfile
│   └── README.md
├── cliente-local/             # Proxy + caché (dentro de Cuba)
│   ├── cmd/
│   │   └── proxy/
│   │       └── main.go
│   ├── internal/
│   │   ├── api/               # Proxy hacia espejo, rutas /api/*
│   │   ├── cache/             # SQLite, TTL, claves
│   │   ├── static/            # Sirve build del dashboard (embed)
│   │   └── auth/              # Token hacia espejo, renovación
│   ├── go.mod
│   ├── go.sum
│   ├── Dockerfile
│   └── README.md
├── dashboard/                 # PWA (React + Vite o SvelteKit)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── api/               # Cliente API (fetch a /api/*)
│   │   ├── stores/
│   │   └── ...
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   ├── Dockerfile             # (opcional) build estático para servir desde proxy
│   └── README.md
├── README.md                  # Raíz: qué es RAULI-VISION, enlaces a docs y a cada componente
└── docker-compose.yml         # (opcional) desarrollo local: espejo + Redis + proxy + dashboard
```

---

## 2. Detalle por componente

### 2.1 `espejo/` (Servidor espejo)

- **Lenguaje:** Go (recomendado) o Node.js.
- **Salidas:** Binario `espejo` (Go) o `node dist/index.js` (Node). Contenedor Docker para deploy en VPS.
- **Dependencias externas:** Redis (cola + caché), opcionalmente ffmpeg/yt-dlp en el mismo contenedor o en un worker separado.
- **Config:** Variables de entorno (URL Redis, secret JWT, API keys de LLM, etc.); no versionar secretos (usar Bóveda / credenciales.txt según directivas).

**Estructura interna sugerida (Go):**

```
espejo/
├── cmd/server/main.go
├── internal/
│   ├── api/          # Handlers: search, video, chat, auth
│   ├── auth/         # JWT issue/validate
│   ├── search/       # Scraper + readability → JSON
│   ├── video/        # yt-dlp, ffmpeg, job queue
│   ├── chat/         # LLM client, summarize URL
│   └── cache/        # Redis client
├── go.mod
├── go.sum
├── Dockerfile
└── README.md
```

---

### 2.2 `cliente-local/` (Proxy)

- **Lenguaje:** Go (recomendado para binario único y bajo consumo) o Node.js.
- **Salidas:** Binario `rauli-proxy` (Go) o `node dist/index.js`. Contenedor Docker opcional; también ejecutable directo en Raspberry/PC.
- **Dependencias:** SQLite (archivo local); no requiere Redis en el cliente.
- **Dashboard estático:** El proxy puede **embeber** el build del dashboard (Go: `embed`, Node: servir carpeta `dashboard/dist`). Así un solo binario sirve API + UI.

**Estructura interna sugerida (Go):**

```
cliente-local/
├── cmd/proxy/main.go
├── internal/
│   ├── api/          # Proxy handlers: reenvío a espejo + caché SQLite
│   ├── cache/        # SQLite, clave por (method, path, query), TTL
│   ├── static/       # embed dashboard/dist
│   └── auth/         # JWT hacia espejo, refresh
├── go.mod
├── go.sum
├── Dockerfile
└── README.md
```

**Flujo de build:**  
1) En CI o local: `cd dashboard && npm run build`.  
2) Copiar `dashboard/dist` a `cliente-local/static/dist` (o ruta configurable).  
3) Build del proxy con `embed` de esa carpeta.  
Alternativa: el proxy sirve los estáticos desde una ruta de disco (ej. `./dist`) sin embed, para desarrollo más ágil.

---

### 2.3 `dashboard/` (PWA)

- **Stack:** React + Vite (o SvelteKit), Tailwind, TanStack Query, PWA (Workbox).
- **Salida:** Carpeta estática `dist/` (HTML, JS, CSS, manifest, service worker). Esa carpeta la sirve el cliente local.
- **API:** Todas las llamadas a `/api/*` (base URL configurable, por defecto relativa para que vaya al mismo origen que sirve el proxy).

**Estructura interna sugerida (React + Vite):**

```
dashboard/
├── src/
│   ├── api/          # Cliente: getSearch(), getVideoSearch(), postChat(), etc.
│   ├── components/   # SearchBar, VideoList, ChatPanel, Skeleton, etc.
│   ├── pages/        # Home, Search, Video, Chat
│   ├── stores/       # Zustand (opcional)
│   ├── App.tsx
│   └── main.tsx
├── public/
├── index.html
├── vite.config.ts
├── package.json
└── README.md
```

---

## 3. Alternativa: tres repositorios separados

Si se prefiere separar por equipo o por ciclo de release:

| Repo | Contenido | Ventaja |
|------|-----------|--------|
| **rauli-vision-espejo** | Solo servidor espejo | Deploy independiente del proxy. |
| **rauli-vision-proxy** | Solo cliente local + opcionalmente copia del build del dashboard | Actualizaciones de proxy sin tocar el espejo. |
| **rauli-vision-dashboard** | Solo frontend PWA | Diseño/frontend puede iterar sin tocar backend. |

**Desventaja:** Sincronizar versiones de API entre repos (contrato en `docs/API_RAULI-VISION.md` compartido vía copia o submódulo). CI en cada repo por separado.

**Recomendación:** Empezar con **monorepo**; si más adelante el equipo o el deploy lo exigen, se puede extraer un componente a su propio repo.

---

## 4. CI/CD (monorepo)

- **CI (ej. GitHub Actions):**
  - On push/PR: lint y test de `espejo/`, `cliente-local/`, `dashboard/`.
  - Build: `espejo` → binario; `cliente-local` → binario; `dashboard` → `npm run build`.
- **CD (opcional):**
  - Espejo: deploy a VPS (Docker o binario).
  - Cliente local: artefacto binario (o Docker) para descarga/instalación en Cuba.
  - Dashboard: no se despliega solo; se embeberá o se servirá desde el proxy.

---

## 5. Resumen

| Componente | Carpeta (monorepo) | Producto |
|------------|--------------------|---------|
| Servidor espejo | `espejo/` | Binario + Docker para VPS |
| Cliente local (proxy) | `cliente-local/` | Binario (+ build del dashboard embebido o en disco) |
| Dashboard PWA | `dashboard/` | Estático `dist/` servido por el proxy |

Documentación compartida en `docs/` (arquitectura, API, estructura). Contrato de API en `docs/API_RAULI-VISION.md` para que los tres componentes mantengan compatibilidad.
