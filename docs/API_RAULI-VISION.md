# RAULI-VISION — Diseño de API

**Alcance:** Contrato entre Dashboard ↔ Cliente local (proxy) y Cliente local ↔ Servidor espejo.  
**Formato:** REST, JSON. Compresión: Brotli en todas las respuestas del espejo.

**Versión de API:** Todas las respuestas incluyen la cabecera `X-API-Version` (ej. `1.0.0`). El contrato actual se considera **v1**; en el futuro se podrá exponer una rama estable bajo `/api/v1/` (ej. `/api/v1/search`) sin romper clientes existentes.

---

## 1. Flujo de peticiones

```
Dashboard (PWA)  →  GET/POST /api/...  →  Cliente local (proxy)
                                              │
                                              ├─ Si hay caché válido → 200 desde SQLite
                                              └─ Si no → reenvía al Espejo
                                                    │
Cliente local  →  GET/POST + Authorization  →  Servidor espejo (VPS)
                                                    │
                                                    └→ 200 + Brotli
```

- El **Dashboard** solo conoce la base URL del cliente local (ej. `http://192.168.1.10:3000` o `/api`).
- El **Cliente local** añade cabecera `Authorization: Bearer <JWT>` (o token firmado) en cada petición al espejo.
- Todas las respuestas del espejo van comprimidas con **Brotli**; el cliente local descomprime y puede cachear el cuerpo.

---

## 2. Autenticación (túnel Espejo ↔ Cliente local)

- **Registro de cliente:** El operador configura en el espejo un `client_id` (o nombre) y se genera un **secret** compartido (o par de claves). El cliente local guarda el secret de forma segura (env o archivo restringido).
- **Peticiones al espejo:** Cabecera `Authorization: Bearer <JWT>`. El JWT lo emite el espejo en un endpoint de login (ej. `POST /auth/token` con `client_id` + `client_secret`), con expiración corta (ej. 1 h); el cliente local renueva antes de expirar.
- **Dashboard ↔ Cliente local:** En redes LAN de confianza puede ser sin auth; si se requiere, API key en cabecera o cookie (configurable).

---

## 3. Endpoints: Dashboard ↔ Cliente local (proxy)

El Dashboard llama siempre a la **misma base** (ej. `/api`). El proxy reexpone los mismos paths y añade prefijo hacia el espejo.

| Método | Path (proxy) | Descripción |
|--------|----------------|-------------|
| GET | `/api/health` | Estado del proxy y, opcional, conectividad al espejo. |
| GET | `/api/search?q=...&max=20` | Búsqueda web optimizada (texto plano). |
| GET | `/api/video/search?q=...&max=15` | Búsqueda de videos (YouTube). |
| GET | `/api/video/:id` | Metadatos de un video (título, duración, calidades disponibles). |
| POST | `/api/video/:id/request` | Solicitar preparación/descarga del video (async). |
| GET | `/api/video/:id/status` | Estado del job (pending / ready / failed). |
| GET | `/api/video/:id/stream` | Streaming o descarga del video (240p/360p). |
| POST | `/api/chat` | Mensaje al chat IA (resumen/respuesta). |
| GET | `/api/chat/history` | Historial reciente del chat (ids + resúmenes, ligero). |

---

## 4. Endpoints: Cliente local ↔ Servidor espejo

El proxy reenvía a `{ESPEJO_URL}/api/...` con `Authorization: Bearer <JWT>`.

| Método | Path (espejo) | Descripción |
|--------|----------------|-------------|
| POST | `/auth/token` | Login: `{ "client_id", "client_secret" }` → `{ "token", "expires_at" }`. |
| GET | `/api/health` | Health check (opcional). |
| GET | `/api/search?q=...&max=20` | Búsqueda; respuesta JSON ligera (ver abajo). |
| GET | `/api/video/search?q=...&max=15` | Búsqueda de videos; respuesta lista de ítems. |
| GET | `/api/video/:id` | Metadatos del video. |
| POST | `/api/video/:id/request` | Encolar descarga/transcode; respuesta `{ "job_id" }`. |
| GET | `/api/video/:id/status?job_id=...` | Estado del job. |
| GET | `/api/video/:id/stream` | Archivo de video (streaming por rangos) o redirect a URL temporal. |
| POST | `/api/chat` | Mensaje al LLM; opción de incluir URL para resumir. |
| GET | `/api/chat/history` | Últimos N mensajes (solo texto, ligero). |

---

## 5. Formatos de request/response

### 5.1 `GET /api/search?q=...&max=20`

**Response (JSON):**

```json
{
  "query": "texto buscado",
  "results": [
    {
      "title": "Título de la página",
      "url": "https://example.com/page",
      "snippet": "Fragmento de texto relevante..."
    }
  ],
  "cached": false
}
```

- `cached`: opcional; si es `true`, el proxy respondió desde caché local.

---

### 5.2 `GET /api/video/search?q=...&max=15`

**Response (JSON):**

```json
{
  "results": [
    {
      "id": "yt_abc123",
      "title": "Título del video",
      "channel": "Nombre del canal",
      "duration_sec": 300,
      "thumbnail_url": "https://... (opcional, ligero)"
    }
  ],
  "cached": false
}
```

---

### 5.3 `GET /api/video/:id`

**Response (JSON):**

```json
{
  "id": "yt_abc123",
  "title": "Título",
  "channel": "Canal",
  "duration_sec": 300,
  "qualities": ["240p", "360p"],
  "ready": false
}
```

- `ready`: `true` si ya existe versión transcode disponible para stream/descarga.

---

### 5.4 `POST /api/video/:id/request`

**Request (JSON):**

```json
{
  "quality": "360p"
}
```

**Response (JSON):**

```json
{
  "job_id": "uuid",
  "status": "pending",
  "message": "Video en cola, puede tardar unos minutos."
}
```

---

### 5.5 `GET /api/video/:id/status?job_id=...`

**Response (JSON):**

```json
{
  "job_id": "uuid",
  "status": "pending | processing | ready | failed",
  "progress_percent": 0,
  "error": null
}
```

- Si `status === "ready"`, el cliente puede llamar a `GET /api/video/:id/stream`.

---

### 5.6 `GET /api/video/:id/stream`

- **Response:** Stream de video (HTTP 200 + `Content-Type: video/mp4`) con soporte a **Range** para reproducir por partes.
- O **302** a URL temporal del espejo (el proxy puede reenviar o descargar y servir desde caché local).

---

### 5.7 `POST /api/chat`

**Request (JSON):**

```json
{
  "message": "¿Qué pasó en la noticia de hoy sobre X?",
  "context_url": "https://example.com/noticia"
}
```

- `context_url`: opcional; si se envía, el espejo obtiene el contenido de la URL (readability), lo pasa al LLM y responde resumiendo.

**Response (JSON):**

```json
{
  "reply": "Texto plano con la respuesta o resumen...",
  "sources_used": ["https://example.com/noticia"]
}
```

- Streaming opcional en una fase posterior (Server-Sent Events o chunked JSON).

---

### 5.8 `GET /api/chat/history`

**Response (JSON):**

```json
{
  "items": [
    {
      "id": "msg_1",
      "role": "user",
      "preview": "¿Qué pasó en...",
      "ts": "2026-01-31T12:00:00Z"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "preview": "Según la noticia...",
      "ts": "2026-01-31T12:00:05Z"
    }
  ]
}
```

- Solo previews y metadatos; no el cuerpo completo, para mantener la respuesta ligera.

---

### 5.9 `GET /api/health`

**Response (JSON):**

```json
{
  "status": "ok",
  "proxy": "ok",
  "espejo": "ok | unreachable",
  "cache_entries": 42
}
```

- El proxy puede comprobar conectividad al espejo con una llamada ligera (ej. `GET /api/health` en el espejo).

---

## 6. Caché en el cliente local (proxy)

- **Clave de caché:** Por método + path + query string (normalizado). Ej. `GET /api/search?q=foo&max=20`.
- **TTL sugerido:**
  - Búsqueda: 1–24 h (configurable).
  - Metadatos de video: 24 h.
  - Stream de video: almacenar archivo en disco; no re-pedir al espejo mientras exista.
  - Chat: no cachear respuestas (o solo por hash de mensaje + context_url, TTL corto).
- **Cabeceras:** El proxy puede añadir `X-Cache: HIT | MISS` y `Cache-Control` para que el dashboard pueda mostrar “desde caché” si se desea.

---

## 7. Códigos HTTP y errores

| Código | Uso |
|--------|-----|
| 200 | OK, cuerpo según el endpoint. |
| 400 | Parámetro faltante o inválido (ej. `q` vacío en búsqueda). |
| 401 | No autorizado (token expirado o inválido en espejo). |
| 404 | Recurso no encontrado (ej. video id inexistente). |
| 409 | Conflicto (ej. job ya en cola). |
| 502 | Proxy no pudo conectar con el espejo. |
| 503 | Servicio no disponible (espejo saturado o en mantenimiento). |

**Cuerpo de error estándar (JSON):**

```json
{
  "error": "bad_request",
  "message": "Parámetro 'q' es obligatorio para la búsqueda."
}
```

---

## 8. Resumen

- **Dashboard** usa solo los paths bajo `/api/` del cliente local.
- **Cliente local** replica esos paths hacia el espejo, añade `Authorization`, cachea respuestas en SQLite y sirve el estático del dashboard.
- **Espejo** implementa los mismos paths bajo `/api/`, comprime con Brotli y devuelve JSON (o stream de video).
- Autenticación túnel: JWT entre cliente local y espejo; Dashboard ↔ proxy configurable (sin auth en LAN o API key).

Este diseño permite implementar primero el proxy y el espejo con stubs y luego conectar el dashboard sin cambiar contrato.
