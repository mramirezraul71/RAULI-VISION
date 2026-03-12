export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0'

export const CHANGELOG = `## v1.1.0 — TikTok Cuba + correcciones

• Nuevo módulo TikTok: acceso vía espejo para usuarios en Cuba
• Proxy multicapa: Cobalt API → tikwm.com → yt-dlp (sin instalar nada)
• Compilaciones TikTok vía YouTube accesibles desde Cuba
• Corrección de etiquetas en el menú (IA, CAMI)
• Proxy siempre disponible sin dependencias locales`
  .trim()
