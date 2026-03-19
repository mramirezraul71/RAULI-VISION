export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.3.7'

export const CHANGELOG = `## v1.3.7 — Vault rediseñado
• Bóveda: reproductor con barra de progreso, botón anterior y controles completos
• Bóveda: video en MP4 — compatible con iOS Safari (sin errores de conexión)
• Bóveda: tarjetas rediseñadas con badge de formato, vista lista/grid, Sort A-Z
• Bóveda: banner "Reproduciendo" con controles en la misma página
• Bóveda: contenido de mayor calidad (música y películas en español)
• Proxy: headers CDN no-cache para forzar versión fresca en Cloudflare

## v1.3.6 — Fixes móvil
• Bóveda: corregido error de autenticación en móvil (token inyectado en peticiones al servidor)
• Divisas: corregido error 401 en widget de tasas de cambio
• SW: cache-buster en index.html garantiza código fresco al detectar nueva versión
• SW: eliminada NavigationRoute obsoleta — index.html siempre desde red (NetworkFirst)

## v1.3.1 — RAULI Vault
• Vault: nueva sección de contenido offline (Canal CAMI + Canal Variado)
• Películas, música MP3 y videoclips disponibles sin conexión
• Rotación automática semanal de películas por slots A/B/C/D
• Player integrado con soporte de seeking (Range requests)

## v1.3.0 — Estabilidad y PWA
• Vercel: fallback SPA corregido — refresh en cualquier ruta ya no muestra página en blanco
• PWA: actualización automática (autoUpdate + skipWaiting) — elimina pantalla en blanco tras deploy
• Proxy API: ruta /api/* sin restricción de métodos — navegación directa a streams funciona correctamente

## v1.2.0 — Dashboard improvements

• FeedbackAI: useMutation, screenshot base64, char counter, image preview, rate limiting, AI result card, error permanente
• AccessPage: auto-copy códigos, timestamps relativos, bulk approve/reject, exportar JSON, empty states, queries invalidadas tras mutación
• VideoPage: "Ver todo" refetch explícito, auto-refresh toggle (60s), Cuba Mode filter, timestamp último chequeo
• ChatPage: borrar historial, cargar contexto desde historial, copiar respuesta, fuentes expandibles, atajo Ctrl+Enter
• NetworkStatus: ping /api/health cada 30s, tres estados (Conectado / Servidor no disponible / Sin internet), colores diferenciados
• client.ts: nueva función processFeedback para /api/feedback/brain`
  .trim()
