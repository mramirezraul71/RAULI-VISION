export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'

export const CHANGELOG = `## Cambios en esta versión

• Dashboard con versión visible y botón "Buscar actualización"
• Modal de actualización con changelog (estándar RAULI-VISION)
• Health enriquecido: versión API, caché (entradas y tamaño)
• Proxy: rate limit, request ID, logging JSON, health con caché
• Espejo: rate limit, validación de entrada, logging JSON`
  .trim()
