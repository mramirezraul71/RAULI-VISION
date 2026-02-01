# Changelog

Todos los cambios notables del proyecto RAULI-VISION se documentan aquí.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

---

## [1.0.0] - 2025-01-31

### Añadido

- **Espejo (servidor VPS)**
  - Rate limit por IP (120 req/min).
  - Validación de entrada (longitud, esquemas URL, caracteres de control) en búsqueda, chat y video.
  - Logging JSON por petición (método, path, status, duración, request_id).
  - Health con versión (`/api/health` incluye `version`).
  - Compresión Brotli en respuestas.

- **Cliente local (proxy)**
  - Rate limit (180 req/min).
  - Request ID (X-Request-ID) en middleware y reenvío al espejo.
  - Logging JSON (mismo formato que espejo).
  - Health enriquecido: versión, `cache_entries`, `cache_size_bytes`; fusión con health del espejo cuando está disponible.
  - Caché SQLite con `Stats()` para métricas.

- **Dashboard (PWA)**
  - Versión visible en footer (Dashboard vX · API vY).
  - Botón "Buscar actualización" (comprueba Service Worker).
  - Modal de actualización con changelog (estándar RAULI-VISION); modo PWA `prompt` para aplicar actualización bajo demanda.
  - Tipado de health (versión, cache_entries, cache_size_bytes).

- **Tests y CI**
  - Tests Go: auth (issue/validate token), validate (SearchQuery, ChatMessage, ContextURL, VideoID), search (fallback, parseDDGHTML, stripHTML), cache (Get/Set, Stats, expiry, CacheKey).
  - GitHub Actions: CI en push/PR a main/master (test espejo, test cliente-local con CGO, build ambos).

- **Docker y despliegue**
  - Dockerfile para espejo (multi-stage, Alpine).
  - Dockerfile para cliente-local (multi-stage, CGO para SQLite, Debian slim).
  - docker-compose: servicios espejo y proxy con healthchecks y volumen de caché.
  - Documentación de despliegue: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

- **Documentación**
  - CHANGELOG.md (este archivo).
  - Guía de usuario: [docs/GUIA_USUARIO.md](docs/GUIA_USUARIO.md).
  - API: versión en cabecera `X-API-Version`; contrato actual considerado v1 (futuro `/api/v1/` opcional).

### Cambiado

- Dashboard: PWA en modo `prompt` (actualización manual desde modal) en lugar de `autoUpdate`.
- Proxy: respuestas de health propias y del espejo unificadas con estadísticas de caché.

---

## [0.x] - Histórico

- Esqueleto inicial: espejo (auth, search, video, chat), proxy con caché, dashboard React (búsqueda, video, chat).
- API básica y diseño de arquitectura documentados.
