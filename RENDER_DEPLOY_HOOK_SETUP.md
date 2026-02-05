# Red segura RAULI-VISION (Puente Cloudflare para Cuba)

## Configuración profesional

RAULI-VISION usa un **Cloudflare Worker** para conectarse al backend sin bloqueos en Cuba.

**Arquitectura:** Cloudflare → espejo-backend (sin proxy intermedio). El proxy no es necesario; Cloudflare aporta caché.

### URL del puente

- **Worker:** `https://puente-rauli-vision.mramirezraul71.workers.dev`
- **Backend destino:** `https://espejo-backend.onrender.com`

### Variables de entorno

- `VITE_API_URL` en `.env` y `dashboard/.env` apunta al puente Cloudflare.
- En desarrollo (sin `VITE_API_URL`), el dashboard usa el proxy local de Vite hacia `localhost:3000`.

### Refactorización realizada

- `dashboard/src/api/client.ts`: usa `VITE_API_URL` para todas las llamadas a la API.
- `dashboard/src/components/FeedbackAI.tsx`: usa `API_BASE` para `/api/feedback/brain`.

## Redesplegar el puente

```bash
cd c:\dev\RAULI-VISION
node deploy_network.js
```

El script actualiza `.env` y `dashboard/.env` con la URL del worker.

## Archivos creados

- `infrastructure/worker.js` – Código del Worker
- `infrastructure/wrangler.toml` – Configuración Wrangler
- `deploy_network.js` – Script de despliegue y configuración
