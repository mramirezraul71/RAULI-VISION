# RAULI-VISION — Funcionalidades

Qué puedes hacer con la app hoy y qué está previsto.

---

## Funcionalidades actuales (ya implementadas)

### 1. Búsqueda optimizada

- **Qué hace:** Escribes una consulta (ej. "youtube", "noticias Cuba") y obtienes una lista de resultados en texto plano: título, enlace y un fragmento (snippet).
- **Cómo:** El espejo usa la API de DuckDuckGo (JSON, sin API key) y, si falla, el HTML de DuckDuckGo. La respuesta va comprimida (Brotli) y el proxy la cachea para no repetir la misma búsqueda.
- **Dónde en la app:** Pestaña **Búsqueda** → barra de búsqueda → botón **Buscar**.
- **Para qué sirve:** Consultar información sin cargar páginas pesadas; ideal para conexiones lentas o costosas.

---

### 2. Video (lista y cola de preparación)

- **Qué hace:**  
  - Buscar “videos” por término (ej. "música") y ver una lista de resultados (título, canal, duración).  
  - Elegir un video y **solicitar preparación** en 360p.  
  - Ver el **estado del job** (pendiente → procesando → listo).
- **Cómo:** El espejo devuelve una lista de ejemplo y simula un job que pasa a “listo” a los pocos segundos. El stream/descarga real (yt-dlp + ffmpeg) está previsto en una fase posterior.
- **Dónde en la app:** Pestaña **Video** → buscar → elegir video → **Solicitar preparación (360p)** → ver estado.
- **Para qué sirve:** Preparar el terreno para “ver o descargar más tarde” cuando el túnel esté mejor; hoy sirve para probar el flujo de cola y estado.

---

### 3. Chat / IA (resumir y preguntar)

- **Qué hace:** Escribes un mensaje (pregunta o “resume esta URL”) y recibes una respuesta en texto. Puedes opcionalmente poner una URL para “resumir esta página”.
- **Cómo:** El espejo responde con un mensaje de ejemplo. En producción se conectaría a un LLM (OpenAI, Anthropic u Ollama) y, si hay URL, se obtendría el contenido de la página y se pasaría al modelo para devolver solo el resumen.
- **Dónde en la app:** Pestaña **IA** → campo opcional “URL a resumir” → mensaje → **Enviar**.
- **Para qué sirve:** Reducir ancho de banda: en vez de cargar varias páginas, una sola pregunta y una respuesta en texto plano.

---

### 4. Caché local (proxy)

- **Qué hace:** El cliente local (proxy) guarda en SQLite las respuestas de búsqueda y de video que ya pidió al espejo. Si vuelves a buscar lo mismo, la respuesta sale del disco (más rápido y sin gastar túnel).
- **Dónde:** No hay pantalla específica; se nota porque las búsquedas repetidas son más rápidas y el proxy puede marcar respuestas como “desde caché”.

---

### 5. Indicador de conexión

- **Qué hace:** En la esquina superior derecha del dashboard ves **● Conectado** (espejo alcanzable) u **○ Local** (solo proxy o espejo no disponible).
- **Para qué sirve:** Saber si las búsquedas y el chat están usando el espejo o solo el proxy/caché.

---

### 6. PWA (instalable y offline)

- **Qué hace:** El dashboard se puede “instalar” como app en el móvil o escritorio y usa Service Worker para cachear recursos. Si ya cargaste la app, puede abrirse aunque el túnel falle (pantalla y navegación; los datos nuevos sí requieren conexión).
- **Dónde:** Depende del navegador (ej. “Añadir a la pantalla de inicio” o “Instalar RAULI-VISION”).

---

## Funcionalidades previstas (roadmap)

| Funcionalidad | Estado | Descripción breve |
|---------------|--------|-------------------|
| **Búsqueda real** | Hecho | DuckDuckGo API + HTML; resultados reales. |
| **Video: descarga/stream real** | Previsto | yt-dlp + ffmpeg en el espejo; 240p/360p; “descargar para ver luego” y caché en el proxy. |
| **IA con LLM real** | Previsto | Integrar OpenAI/Anthropic/Ollama en el espejo; respuestas reales y “resumir URL”. |
| **Túnel más resistente** | Previsto | QUIC, reconexión automática, ofuscación para entornos con filtrado. |
| **Panel de diagnóstico** | Previsto | Ver estado del túnel, caché y cola de jobs desde el dashboard. |

---

## Resumen rápido

| Qué quieres hacer | Dónde | Estado |
|-------------------|--------|--------|
| Buscar en internet (texto + enlaces) | Búsqueda | Funcional (DuckDuckGo) |
| Ver lista de “videos” y solicitar preparación | Video | Funcional (lista + cola simulada) |
| Chatear / pedir resumen de una URL | IA | Funcional (respuesta de ejemplo; LLM pendiente) |
| Aprovechar caché para no repetir peticiones | Automático en proxy | Funcional |
| Ver si estás conectado al espejo | Indicador arriba a la derecha | Funcional |
| Usar la app instalada y en parte offline | PWA | Funcional |
| Descargar / ver video real en baja calidad | Video | Previsto (yt-dlp + ffmpeg) |
| Respuestas de IA reales y resumir páginas | IA | Previsto (LLM) |

---

La app está pensada para **entornos de bajo ancho de banda** (ej. Cuba): el espejo hace el trabajo pesado fuera y por el túnel solo viaja contenido ligero y comprimido; el proxy cachea para que la experiencia sea más rápida y estable.
