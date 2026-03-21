export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.3.9'

export const CHANGELOG = `## v1.3.9 - Conexion final y limpieza
- TikTok: status y fetch ahora conservan el codigo de acceso del usuario
- Consola limpia en la pestaña TikTok cuando se usa enlace autorizado
- Ajustes finales para evitar falsos errores de conexion en el cliente

## v1.3.8 - Conexion y autenticacion
- Video: las llamadas protegidas ahora conservan el codigo de acceso del usuario
- TikTok: el feed en vivo SSE usa la misma identidad del usuario que el resto de la app
- Dashboard: version subida para forzar recarga fresca en PWA, movil y Cloudflare

## v1.3.7 - Vault redisenado
- Boveda: reproductor con barra de progreso, boton anterior y controles completos
- Boveda: video en MP4 compatible con iOS Safari
- Boveda: tarjetas redisenadas con badge de formato, vista lista/grid, Sort A-Z
- Boveda: banner "Reproduciendo" con controles en la misma pagina
- Boveda: contenido de mayor calidad en musica y peliculas en espanol
- Proxy: headers CDN no-cache para forzar version fresca en Cloudflare

## v1.3.6 - Fixes movil
- Boveda: corregido error de autenticacion en movil
- Divisas: corregido error 401 en widget de tasas de cambio
- SW: cache-buster en index.html garantiza codigo fresco al detectar nueva version
- SW: eliminada NavigationRoute obsoleta; index.html siempre desde red

## v1.3.1 - RAULI Vault
- Vault: nueva seccion de contenido offline (Canal CAMI + Canal Variado)
- Peliculas, musica MP3 y videoclips disponibles sin conexion
- Rotacion automatica semanal de peliculas por slots A/B/C/D
- Player integrado con soporte de seeking (Range requests)

## v1.3.0 - Estabilidad y PWA
- Vercel: fallback SPA corregido; refresh en cualquier ruta ya no muestra pagina en blanco
- PWA: actualizacion automatica (autoUpdate + skipWaiting)
- Proxy API: ruta /api/* sin restriccion de metodos

## v1.2.0 - Dashboard improvements
- FeedbackAI: useMutation, screenshot base64, char counter, image preview, rate limiting, AI result card, error permanente
- AccessPage: auto-copy codigos, timestamps relativos, bulk approve/reject, exportar JSON, empty states, queries invalidadas tras mutacion
- VideoPage: "Ver todo" refetch explicito, auto-refresh toggle (60s), Cuba Mode filter, timestamp ultimo chequeo
- ChatPage: borrar historial, cargar contexto desde historial, copiar respuesta, fuentes expandibles, atajo Ctrl+Enter
- NetworkStatus: ping /api/health cada 30s, tres estados (Conectado / Servidor no disponible / Sin internet)
- client.ts: nueva funcion processFeedback para /api/feedback/brain`
  .trim()
