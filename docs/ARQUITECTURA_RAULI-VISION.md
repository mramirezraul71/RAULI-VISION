# RAULI-VISION — Plan de Arquitectura de Alto Nivel

**Rol:** Arquitecto Jefe de Software y Estratega de Producto  
**Contexto:** Dashboard unificado para entornos de bajo ancho de banda (Cuba).  
**Objetivo:** Túnel optimizado entre servidor espejo (exterior) y cliente local (isla); UX de “lujo funcional”.

---

## 1. Resumen ejecutivo

RAULI-VISION no es un frontend bonito sobre internet crudo: es un **intermediario inteligente** que concentra la complejidad en un servidor externo (VPS rápido) y entrega al usuario final solo **contenido premasticado y ultra-ligero** a través de un túnel comprimido y cacheable. El frontend debe sentirse instantáneo y profesional; el backend/túnel debe ser el verdadero cerebro.

---

## 2. Restricciones asumidas (el desafío Cuba)

| Restricción | Implicación técnica |
|-------------|---------------------|
| Ancho de banda muy bajo (kB/s) | Todo salida del túnel: comprimido (Brotli/zstd). Cero payload innecesario. |
| Latencia alta | Caché local agresivo; prefetch inteligente; skeleton/feedback en UI. |
| Conexiones inestables | Protocolo tolerante a cortes (reconexión, idempotencia, chunking). |
| Filtrado/bloqueo ISP | Túnel único cifrado servidor↔cliente; tráfico ofuscado; no exponer dominios sensibles en claro. |
| Usuario no técnico | UI minimalista, mensajes claros de espera, sin jerga. |

---

## 3. Arquitectura de alto nivel: el túnel y el cerebro

```
                    [INTERNET LIBRE]
                           │
                    ┌──────▼──────┐
                    │  SERVIDOR   │  ← "El Espejo" (VPS fuera de Cuba)
                    │  RAULI-V    │     Búsqueda, video, IA, compresión
                    └──────┬──────┘
                           │ Túnel cifrado + comprimido (Brotli/zstd)
                           │ Protocolo: HTTPS/QUIC + API binaria (opcional)
                    ┌──────▼──────┐
                    │  CLIENTE    │  ← PC / Raspberry / Móvil en red local
                    │  LOCAL      │     Caché SQLite, sirve dashboard + proxy
                    │  (Proxy)    │
                    └──────┬──────┘
                           │ LAN estable
                    ┌──────▼──────┐
                    │  DASHBOARD  │  ← Navegador / PWA en dispositivos de la familia
                    │  (PWA)      │     UI “lujo funcional”, offline-first
                    └─────────────┘
```

- **Servidor espejo (exterior):** hace el trabajo pesado (scraping, transcodificación, IA), comprime y envía solo lo mínimo.
- **Cliente local (proxy):** mantiene caché, sirve el estático del dashboard y reenvía peticiones al espejo; puede seguir sirviendo caché aunque el túnel se caiga.
- **Dashboard (PWA):** habla solo con el cliente local; nunca con internet crudo.

---

## 4. Stack tecnológico recomendado

### 4.1 Frontend — Dashboard (“lujo funcional”)

| Capa | Tecnología | Razón |
|------|------------|--------|
| Framework | **React + Vite** o **SvelteKit** | Vite: build rápido, bundle pequeño. SvelteKit: aún menos JS, ideal para bajo ancho de banda. |
| Estilos | **Tailwind CSS** | Consistencia visual, purge de CSS no usado, diseño “Apple/Google” alcanzable. |
| Componentes | **Headless (Radix UI)** o **shadcn/ui** | Accesibilidad y control total del look; sin dependencias gigantes. |
| Estado / datos | **TanStack Query (React Query)** + **Zustand** | Cache en cliente, stale-while-revalidate, estados de carga/error bien definidos. |
| PWA | **vite-plugin-pwa** (Workbox) | Offline-first, cache de assets y de respuestas API; app instalable. |
| Feedback de carga | Skeletons, spinners contextuales, mensajes tipo “Trayendo información del exterior…” | Evitar pantalla en blanco; confianza. |

**Principios frontend:**  
- Bundle inicial < 200 KB gzipped.  
- Todas las peticiones “pesadas” van al cliente local; el dashboard no sabe de internet exterior.  
- Primera pantalla usable desde caché (service worker) aunque el túnel falle.

---

### 4.2 Backend — Servidor espejo (“El Espejo”, VPS exterior)

| Capa | Tecnología | Razón |
|------|------------|--------|
| Runtime | **Go (Go 1.21+)** | Concurrencia, bajo uso de memoria, un solo binario; ideal para proxy y compresión. |
| Alternativa rápida | **Node.js + Fastify** | Mismo lenguaje que el frontend; ecosistema rico para scraping e IA. |
| API | **REST sobre HTTPS** (o **gRPC** si se prioriza eficiencia binaria) | REST: simple, cacheable, Brotli en respuestas. gRPC: menos overhead, streaming. |
| Compresión salida | **Brotli** (o **zstd** en Go) | Mejor ratio que gzip para texto/JSON; aceptado en HTTP. |
| Búsqueda “texto plano” | **Go: colly + go-readability** / **Node: Puppeteer + readability** | Descargar página → extraer texto y enlaces → eliminar ads/scripts → devolver JSON ultra-ligero. |
| Video (YouTube curado) | **yt-dlp + ffmpeg** | Descargar → transcode a 240p/360p (H.264, bitrate bajo) → servir por streaming o descarga. Cola de trabajos (Redis + worker). |
| IA “resumir internet” | **LLM en la nube (OpenAI/Anthropic)** o **modelo local (Ollama)** | Servidor espejo lee URLs, pasa contenido a la IA, devuelve solo texto resumido por el túnel. |
| Cola de trabajos | **Redis + worker en Go/Node** | Transcodificación y scraping pesado en segundo plano; respuestas async (polling o WebSocket). |
| Caché en espejo | **Redis** (o **in-memory** para pocas instancias) | Evitar repetir scraping/transcode para la misma URL. |

**Principios backend espejo:**  
- Ninguna respuesta sin comprimir (Brotli/zstd).  
- Respuestas de búsqueda: solo texto + enlaces; sin HTML crudo.  
- Video: nunca streaming 4K; 240p/360p optimizado y, cuando sea posible, “descargar para ver luego”.

---

### 4.3 Cliente local / proxy (“Dentro de Cuba”)

| Capa | Tecnología | Razón |
|------|------------|--------|
| Runtime | **Go** (binario único) o **Node.js** | Go: mínimo consumo, despliegue en Raspberry/PC vieja. Node: reutilizar lógica y equipo. |
| Caché local | **SQLite** (con **Litestream** opcional para backup) | Sin servidor extra; suficiente para HTML/JSON/ metadatos de video; offline-first. |
| Sirve | Dashboard (estático) + API proxy al espejo | El navegador solo habla con `localhost` o IP del proxy. |
| Autenticación túnel | **JWT** o **tokens firmados** | Solo clientes autorizados hablan con el espejo; renovación sin exponer secretos. |
| Reconexión | Reintentos con backoff exponencial; cola de peticiones fallidas | Tolerancia a cortes de conexión largos. |

**Principios cliente local:**  
- Máxima reutilización de caché: si está en SQLite, no volver a pedir al espejo hasta TTL.  
- Dashboard servido desde disco; primera carga sin depender del túnel.

---

### 4.4 Protocolo y formato de datos (túnel)

| Aspecto | Recomendación |
|---------|----------------|
| Transporte | **HTTPS** (o **QUIC** si se usa Go y se prioriza reconexión rápida en redes inestables). |
| Compresión | **Brotli** en respuestas HTTP (o **zstd** si el cliente lo soporta). |
| Formato | **JSON** para simplicidad y cache; opcional **MessagePack** para reducir tamaño si el equipo lo asume. |
| Streaming video | **HTTP range requests** o **HLS/DASH en calidades bajas** generados por ffmpeg en el espejo. |

No hace falta un protocolo binario custom en v1; HTTPS + JSON + Brotli ya aporta la mayor ganancia. En una fase 2 se puede valorar gRPC o MessagePack para reducir más el payload.

---

## 5. Módulos principales del producto

### 5.1 Motor de búsqueda optimizado

- **UI:** Barra de búsqueda tipo Google; resultados solo texto + enlaces.
- **Flujo:** Usuario busca → petición al cliente local → cliente reenvía al espejo → espejo (o cola) hace búsqueda (Google/Bing scraping o API), extrae texto y enlaces con readability, elimina ads/scripts → respuesta JSON comprimida → cliente local cachea → dashboard muestra lista ligera.
- **Stack espejo:** Go (colly + go-readability) o Node (Puppeteer + readability). Salida: JSON `{ title, url, snippet }[]`.

### 5.2 Visor de YouTube (curado/comprimido)

- **UI:** Buscar video → lista de resultados (títulos, thumbnails ligeros) → al elegir: “Ver ahora (baja calidad)” o “Descargar para ver luego”.
- **Flujo:** Espejo usa yt-dlp + ffmpeg → transcode 240p/360p → guarda en disco o almacenamiento temporal → sirve por URL de descarga o streaming por rangos. Cliente local puede cachear el archivo para uso offline.
- **Stack:** Redis + worker (Go/Node) para cola; ffmpeg con preset rápido y bitrate bajo.

### 5.3 IA integrada (“resumir el internet”)

- **UI:** Chat tipo ChatGPT dentro del dashboard.
- **Flujo:** Usuario pregunta o pide “resume esta URL” → espejo recibe la petición, opcionalmente obtiene contenido de la URL (readability), llama a LLM (OpenAI/Anthropic o Ollama), devuelve solo el texto de la respuesta por el túnel.
- **Stack:** Servicio en el espejo que orquesta fetch + LLM; respuestas en texto plano; compresión Brotli en todas las respuestas.

---

## 6. Experiencia de usuario (UX/UI)

- **Estándar visual:** Minimalista, limpio, tipografía clara, iconografía reconocible. Profesional y confiable.
- **Espera:** Skeleton screens en listas y detalle; indicadores de progreso en descargas; mensajes explícitos: “Trayendo información del exterior, un momento…”.
- **Offline:** Dashboard y caché local permiten ver contenido ya descargado y usar la app aunque el túnel esté caído.
- **Errores:** Mensajes claros (“No hay conexión con el servidor. Se reintentará.”) y acciones posibles (“Reintentar”, “Usar contenido en caché”).

---

## 7. Roadmap técnico sugerido (alto nivel)

1. **Fase 0 — Cimiento**  
   - Definir contrato API espejo ↔ cliente local (REST, formatos JSON).  
   - Implementar cliente local mínimo (Go o Node): proxy + SQLite para caché.  
   - Servir dashboard estático (Vite + PWA) desde el cliente local.

2. **Fase 1 — Búsqueda y caché**  
   - Endpoint de búsqueda en el espejo (scraping + readability → JSON).  
   - Compresión Brotli en todas las respuestas.  
   - Dashboard: barra de búsqueda + lista de resultados + skeletons.

3. **Fase 2 — Video**  
   - Pipeline yt-dlp + ffmpeg en el espejo; cola Redis.  
   - API “solicitar video” → “descargar” / “ver en baja calidad”.  
   - Cliente local cachea archivos de video y los sirve en LAN.

4. **Fase 3 — IA**  
   - Servicio de chat en el espejo; integración LLM; opción “resumir URL”.  
   - UI de chat en el dashboard con historial ligero (solo texto).

5. **Fase 4 — Endurecimiento**  
   - QUIC o ajustes de reconexión; ofuscación/seguridad del túnel; métricas y alertas.

---

## 8. Resumen de tecnologías

| Capa | Tecnología principal |
|------|----------------------|
| **Frontend (Dashboard)** | React + Vite (o SvelteKit), Tailwind, Radix/shadcn, TanStack Query, PWA (Workbox) |
| **Servidor espejo (VPS)** | Go (o Node + Fastify), Brotli/zstd, colly + readability / Puppeteer, yt-dlp + ffmpeg, Redis, LLM API |
| **Cliente local (proxy)** | Go o Node, SQLite, proxy reverso para estático + API |
| **Túnel** | HTTPS (o QUIC), JSON + Brotli, JWT/tokens para auth |

Este plan de alto nivel permite construir RAULI-VISION como un **túnel optimizado** con un **dashboard de lujo funcional**, alineado con las restricciones de Cuba y con la visión de producto definida.
