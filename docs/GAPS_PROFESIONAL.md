# RAULI-VISION — Qué falta para que sea profesional

Criterio: nivel “producto profesional” (listo para usuarios reales en entornos hostiles). Priorizado por impacto y esfuerzo.

---

## 1. Crítico (seguridad y producción)

| Gap | Estado actual | Qué falta |
|-----|----------------|-----------|
| **HTTPS en el túnel** | Espejo y proxy usan HTTP. | En producción, espejo y proxy detrás de TLS (certificado, reverse proxy o terminación en nube). Sin esto el túnel no es seguro. |
| **Secrets en runtime** | JWT_SECRET y client_secret por env; riesgo si se versionan. | Cargar desde Bóveda (credenciales.txt) o gestor de secretos; nunca en repo. |
| **Validación de entrada** | Parámetros (q, id, URLs) se usan sin sanitizar. | Límites de longitud, allowlist de esquemas en URLs, escape en respuestas para evitar inyección. |
| **Rate limiting** | No hay límite por IP/cliente. | En espejo y/o proxy: límite por IP (ej. 60 req/min) para evitar abuso. |

---

## 2. Funcionalidad “real” (valor de producto)

| Gap | Estado actual | Qué falta |
|-----|----------------|-----------|
| **Video real (descarga/stream)** | Lista y cola simuladas; stream devuelve 501. | Pipeline en espejo: yt-dlp + ffmpeg (240p/360p), cola (Redis), endpoint de descarga/stream; proxy cachea archivos. |
| **IA real (LLM)** | Chat devuelve texto de ejemplo. | En espejo: integración con OpenAI/Anthropic u Ollama; opción “resumir URL” (fetch + readability + LLM); respuestas en texto plano por el túnel. |
| **Búsqueda** | DuckDuckGo API + HTML; ya funcional. | Opcional: segunda fuente (ej. Bing API si hay key) o mejor manejo cuando DDG no devuelve nada. |

---

## 3. Observabilidad y operación

| Gap | Estado actual | Qué falta |
|-----|----------------|-----------|
| **Logging estructurado** | log.Printf en espejo/proxy. | Logs en JSON (nivel, mensaje, request_id, duración); fácil de enviar a archivo o agregador. |
| **Métricas** | Ninguna. | Contadores/timers básicos: requests por endpoint, errores, latencia p50/p99, tamaño de caché; endpoint /metrics (Prometheus) o equivalente. |
| **Health útil** | /api/health devuelve ok. | Incluir: versión, dependencias (Redis si se usa, DB), latencia al espejo desde el proxy. |
| **Trazas** | No hay. | Opcional: request_id de punta a punta (dashboard → proxy → espejo) para depurar fallos. |

---

## 4. Tests y calidad de código

| Gap | Estado actual | Qué falta |
|-----|----------------|-----------|
| **Tests unitarios** | No hay. | Tests para: auth (issue/validate token), search (parse DDG JSON/HTML), cache (get/set/ttl), handlers que devuelven JSON esperado. |
| **Tests de integración** | No hay. | Al menos: proxy → espejo (auth + search + health); dashboard → proxy (health + search). |
| **CI** | No hay. | Pipeline (GitHub Actions o similar): lint, test, build espejo, build proxy, build dashboard; en cada PR o push a main. |
| **Linting** | No estandarizado. | go vet / golangci-lint en espejo y proxy; ESLint + TypeScript en dashboard; reglas compartidas. |

---

## 5. UX y producto “pulido”

| Gap | Estado actual | Qué falta |
|-----|----------------|-----------|
| **Sistema de actualizaciones** | No hay. | Según tu estándar: botón “Buscar actualización”, chequeo en segundo plano, modal con versión y changelog; reversión si falla; limpieza de caché post-actualización. |
| **Versión visible** | No hay. | Versión en build (env o archivo); mostrarla en footer o ajustes (ej. “v1.0.0”). |
| **Manejo de errores** | Mensajes genéricos en varios sitios. | Mensajes claros por tipo (sin red, espejo caído, timeout); botón “Reintentar” donde aplique; no pantallas en blanco. |
| **Accesibilidad** | Básica. | Contraste, foco visible, labels en formularios, roles ARIA donde haga falta; al menos nivel AA razonable. |
| **Responsive** | Tailwind y layout flexible. | Revisar en móvil (búsqueda, lista de videos, chat); toques y tamaños de botón adecuados. |
| **Onboarding** | Ninguno. | Opcional: primera vez “Conecte el proxy al espejo” o “Si solo ve Local, ejecute…”; una sola vez. |

---

## 6. Despliegue y entrega

| Gap | Estado actual | Qué falta |
|-----|----------------|-----------|
| **Contenedores** | No hay. | Dockerfile para espejo y proxy; opcional docker-compose para desarrollo (espejo + proxy + Redis). |
| **Variables de entorno documentadas** | Parcial en README. | Lista explícita: ESPEJO_URL, CLIENT_ID, CLIENT_SECRET, JWT_SECRET, PORT, CACHE_DB; valores por entorno (dev/prod). |
| **Release y artefactos** | Solo código. | Script o CI que genere binarios (espejo, proxy) por plataforma y/o imagen Docker; opcional tag de versión (v1.0.0). |
| **Guía de despliegue** | Cómo ejecutar en local. | Doc: desplegar espejo en VPS (systemd o Docker), proxy en máquina local/Raspberry; firewall y puertos. |

---

## 7. Documentación

| Gap | Estado actual | Qué falta |
|-----|----------------|-----------|
| **Guía de usuario** | No hay. | Una página: “Qué es RAULI-VISION”, “Cómo buscar”, “Cómo solicitar un video”, “Qué hacer si no hay conexión”. |
| **Changelog** | No hay. | CHANGELOG.md con versiones y cambios; vinculado al sistema de actualizaciones. |
| **API estable** | Contrato en docs. | Versión en path o cabecera (ej. /api/v1/search) para no romper clientes al evolucionar. |

---

## Priorización sugerida (orden de ejecución)

1. **HTTPS + secrets** (seguridad mínima para producción).  
2. **Rate limiting + validación de entrada** (proteger espejo y proxy).  
3. **Logging estructurado + health enriquecido** (operar y depurar).  
4. **Tests unitarios + CI** (evitar regresiones).  
5. **Sistema de actualizaciones + versión visible** (alineado con tu estándar y percepción “profesional”).  
6. **Video real (yt-dlp + ffmpeg)** (diferenciador de producto).  
7. **IA real (LLM)** (diferenciador de producto).  
8. **Docker + guía de despliegue** (entrega repetible).  
9. **Métricas + guía de usuario + changelog** (pulido final).

---

## Resumen en una frase

Para que sea **profesional**: túnel seguro (HTTPS, secrets), observabilidad básica (logs, health, opcional métricas), tests y CI, sistema de actualizaciones y versión visible, y luego video e IA reales; el resto (Docker, docs de usuario, changelog) redondea la entrega y la operación.
