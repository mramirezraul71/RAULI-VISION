# RAULI-VISION â€” DiseÃ±o de API

**Alcance:** Contrato entre Dashboard â†” Cliente local (proxy) y Cliente local â†” Servidor espejo.  
**Formato:** REST, JSON. CompresiÃ³n: Brotli en todas las respuestas del espejo.

**VersiÃ³n de API:** Todas las respuestas incluyen la cabecera `X-API-Version` (ej. `1.0.0`). El contrato actual se considera **v1**; en el futuro se podrÃ¡ exponer una rama estable bajo `/api/v1/` (ej. `/api/v1/search`) sin romper clientes existentes.

---

## 1. Flujo de peticiones

```
Dashboard (PWA)  â†’  GET/POST /api/...  â†’  Cliente local (proxy)
                                              â”‚
                                              â”œâ”€ Si hay cachÃ© vÃ¡lido â†’ 200 desde SQLite
                                              â””â”€ Si no â†’ reenvÃ­a al Espejo
                                                    â”‚
Cliente local  â†’  GET/POST + Authorization  â†’  Servidor espejo (VPS)
                                                    â”‚
                                                    â””â†’ 200 + Brotli
```

- El **Dashboard** solo conoce la base URL del cliente local (ej. `http://192.168.1.10:3000` o `/api`).
- El **Cliente local** aÃ±ade cabecera `Authorization: Bearer <JWT>` (o token firmado) en cada peticiÃ³n al espejo.
- Todas las respuestas del espejo van comprimidas con **Brotli**; el cliente local descomprime y puede cachear el cuerpo.

---

## 2. AutenticaciÃ³n (tÃºnel Espejo â†” Cliente local)

- **Registro de cliente:** El operador configura en el espejo un `client_id` (o nombre) y se genera un **secret** compartido (o par de claves). El cliente local guarda el secret de forma segura (env o archivo restringido).
- **Peticiones al espejo:** Cabecera `Authorization: Bearer <JWT>`. El JWT lo emite el espejo en un endpoint de login (ej. `POST /auth/token` con `client_id` + `client_secret`), con expiraciÃ³n corta (ej. 1 h); el cliente local renueva antes de expirar.
- **Dashboard â†” Cliente local:** En redes LAN de confianza puede ser sin auth; si se requiere, API key en cabecera o cookie (configurable).

---

## 3. Endpoints: Dashboard â†” Cliente local (proxy)

El Dashboard llama siempre a la **misma base** (ej. `/api`). El proxy reexpone los mismos paths y aÃ±ade prefijo hacia el espejo.

| MÃ©todo | Path (proxy) | DescripciÃ³n |
|--------|----------------|-------------|
| GET | `/api/health` | Estado del proxy y, opcional, conectividad al espejo. |
| GET | `/api/search?q=...&max=20` | BÃºsqueda web optimizada (texto plano). |
| GET | `/api/video/search?q=...&max=15` | Catalogo de canales TV en espanol (busqueda/filtrado). |
| GET | `/api/video/:id` | Metadatos de un video (tÃ­tulo, duraciÃ³n, calidades disponibles). |
| POST | `/api/video/:id/request` | Solicitar preparaciÃ³n/descarga del video (async). |
| GET | `/api/video/:id/status` | Estado del job (pending / ready / failed). |
| GET | `/api/video/:id/stream` | Redireccion temporal (302) al canal en vivo (directo o modo Cuba). |
| GET | `/api/video/channels/health?max=12&mode=cuba` | Salud operativa de canales TV (latencia + estado HTTP). |
| POST | `/api/chat` | Mensaje al chat IA (resumen/respuesta). |
| GET | `/api/chat/history` | Historial reciente del chat (ids + resÃºmenes, ligero). |

---

## 4. Endpoints: Cliente local â†” Servidor espejo

El proxy reenvÃ­a a `{ESPEJO_URL}/api/...` con `Authorization: Bearer <JWT>`.

| MÃ©todo | Path (espejo) | DescripciÃ³n |
|--------|----------------|-------------|
| POST | `/auth/token` | Login: `{ "client_id", "client_secret" }` â†’ `{ "token", "expires_at" }`. |
| GET | `/api/health` | Health check (opcional). |
| GET | `/api/search?q=...&max=20` | BÃºsqueda; respuesta JSON ligera (ver abajo). |
| GET | `/api/video/search?q=...&max=15` | Catalogo de canales TV en espanol; respuesta lista de items. |
| GET | `/api/video/:id` | Metadatos del video. |
| POST | `/api/video/:id/request` | Encolar descarga/transcode; respuesta `{ "job_id" }`. |
| GET | `/api/video/:id/status?job_id=...` | Estado del job. |
| GET | `/api/video/:id/stream` | URL de reproduccion del canal en vivo (redirect 302 o JSON con `format=json`). |
| GET | `/api/video/channels/health?max=12&mode=cuba` | Salud operativa de canales TV (latencia + estado HTTP). |
| POST | `/api/chat` | Mensaje al LLM; opciÃ³n de incluir URL para resumir. |
| GET | `/api/chat/history` | Ãšltimos N mensajes (solo texto, ligero). |

---

## 5. Formatos de request/response

### 5.1 `GET /api/search?q=...&max=20`

**Response (JSON):**

```json
{
  "query": "texto buscado",
  "results": [
    {
      "title": "TÃ­tulo de la pÃ¡gina",
      "url": "https://example.com/page",
      "snippet": "Fragmento de texto relevante..."
    }
  ],
  "cached": false
}
```

- `cached`: opcional; si es `true`, el proxy respondiÃ³ desde cachÃ© local.

---

### 5.2 `GET /api/video/search?q=...&max=15`

**Response (JSON):**

```json
{
  "results": [
    {
      "id": "yt_abc123",
      "title": "TÃ­tulo del video",
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
  "title": "TÃ­tulo",
  "channel": "Canal",
  "duration_sec": 300,
  "qualities": ["240p", "360p"],
  "ready": false
}
```

- `ready`: `true` si ya existe versiÃ³n transcode disponible para stream/descarga.

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

- **Response por defecto:** `302` a la URL resuelta del canal en vivo.
- **Modo Cuba:** usar `?mode=cuba` para aplicar ruta optimizada (proxy/fallback).
- **Modo JSON (diagnostico):** usar `?format=json` para obtener la URL final sin redirigir.

---

### 5.7 `GET /api/video/channels/health?max=12&mode=cuba`

**Response (JSON):**

```json
{
  "items": [
    {
      "id": "rtve_24h",
      "title": "Canal 24 Horas",
      "channel": "RTVE",
      "url": "https://www.rtve.es/play/videos/directo/canales-lineales/24h/",
      "cuba_mode": true,
      "cuba_ready": true,
      "reachable": true,
      "status_code": 200,
      "latency_ms": 421,
      "checked_at": "2026-03-09T18:33:28Z"
    }
  ],
  "mode": "cuba",
  "checked_at": "2026-03-09T18:33:28Z",
  "total": 12,
  "reachable": 11,
  "unavailable": 1
}
```

---

### 5.8 `POST /api/chat`

**Request (JSON):**

```json
{
  "message": "Â¿QuÃ© pasÃ³ en la noticia de hoy sobre X?",
  "context_url": "https://example.com/noticia"
}
```

- `context_url`: opcional; si se envÃ­a, el espejo obtiene el contenido de la URL (readability), lo pasa al LLM y responde resumiendo.

**Response (JSON):**

```json
{
  "reply": "Texto plano con la respuesta o resumen...",
  "sources_used": ["https://example.com/noticia"]
}
```

- Streaming opcional en una fase posterior (Server-Sent Events o chunked JSON).

---

### 5.9 `GET /api/chat/history`

**Response (JSON):**

```json
{
  "items": [
    {
      "id": "msg_1",
      "role": "user",
      "preview": "Â¿QuÃ© pasÃ³ en...",
      "ts": "2026-01-31T12:00:00Z"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "preview": "SegÃºn la noticia...",
      "ts": "2026-01-31T12:00:05Z"
    }
  ]
}
```

- Solo previews y metadatos; no el cuerpo completo, para mantener la respuesta ligera.

---

### 5.10 `GET /api/health`

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

## 6. CachÃ© en el cliente local (proxy)

- **Clave de cachÃ©:** Por mÃ©todo + path + query string (normalizado). Ej. `GET /api/search?q=foo&max=20`.
- **TTL sugerido:**
  - BÃºsqueda: 1â€“24 h (configurable).
  - Metadatos de video: 24 h.
  - Stream de video: almacenar archivo en disco; no re-pedir al espejo mientras exista.
  - Chat: no cachear respuestas (o solo por hash de mensaje + context_url, TTL corto).
- **Cabeceras:** El proxy puede aÃ±adir `X-Cache: HIT | MISS` y `Cache-Control` para que el dashboard pueda mostrar â€œdesde cachÃ©â€ si se desea.

---

## 7. CÃ³digos HTTP y errores

| CÃ³digo | Uso |
|--------|-----|
| 200 | OK, cuerpo segÃºn el endpoint. |
| 400 | ParÃ¡metro faltante o invÃ¡lido (ej. `q` vacÃ­o en bÃºsqueda). |
| 401 | No autorizado (token expirado o invÃ¡lido en espejo). |
| 404 | Recurso no encontrado (ej. video id inexistente). |
| 409 | Conflicto (ej. job ya en cola). |
| 502 | Proxy no pudo conectar con el espejo. |
| 503 | Servicio no disponible (espejo saturado o en mantenimiento). |

**Cuerpo de error estÃ¡ndar (JSON):**

```json
{
  "error": "bad_request",
  "message": "ParÃ¡metro 'q' es obligatorio para la bÃºsqueda."
}
```

---

## 8. Resumen

- **Dashboard** usa solo los paths bajo `/api/` del cliente local.
- **Cliente local** replica esos paths hacia el espejo, aÃ±ade `Authorization`, cachea respuestas en SQLite y sirve el estÃ¡tico del dashboard.
- **Espejo** implementa los mismos paths bajo `/api/`, comprime con Brotli y devuelve JSON (o stream de video).
- AutenticaciÃ³n tÃºnel: JWT entre cliente local y espejo; Dashboard â†” proxy configurable (sin auth en LAN o API key).

Este diseÃ±o permite implementar primero el proxy y el espejo con stubs y luego conectar el dashboard sin cambiar contrato.

