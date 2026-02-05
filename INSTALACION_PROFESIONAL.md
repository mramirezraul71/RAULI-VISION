# RAULI-VISION — Instalación profesional

## Arquitectura recomendada (Cloudflare + 1 servicio Render)

```
Usuario (Cuba/global) → Cloudflare Worker → espejo-backend (Render)
                              ↓
                    puente-rauli-vision.workers.dev
                              ↓
                    espejo-backend.onrender.com
```

**El proxy NO es necesario** en la instalación cloud:
- Cloudflare aporta caché en el edge
- 1 solo servicio en Render = menos coste, menos puntos de fallo
- El proxy (cliente-local) usaba SQLite/CGO y podía dar problemas en Render

## Pasos de instalación

### 1. Desplegar backend en Render

- Conectar el repo en [Render](https://render.com)
- El `render.yaml` desplegará solo **espejo-backend**
- Si tenías proxy-backend: eliminarlo desde el Dashboard de Render (ya no se usa)
- Esperar a que espejo esté activo (URL: `https://espejo-backend.onrender.com`)

### 2. Desplegar puente Cloudflare

```bash
cd c:\dev\RAULI-VISION
node deploy_network.js
```

Esto:
- Despliega el Worker `puente-rauli-vision`
- Actualiza `.env` y `dashboard/.env` con `VITE_API_URL`

### 3. Desplegar dashboard en Vercel

- Proyecto: carpeta `dashboard/`
- Las variables de entorno se cargan del build (VITE_API_URL en .env)

### 4. Verificar

- Abrir el dashboard desplegado
- Comprobar que `/api/health` responde vía Cloudflare

## Flujo de datos

| Origen   | Destino        | Ruta                                   |
|----------|----------------|----------------------------------------|
| Dashboard | API            | `${VITE_API_URL}/api/...`              |
| Producción | Cloudflare     | puente-rauli-vision.workers.dev        |
| Cloudflare | Render        | espejo-backend.onrender.com            |

## Uso del proxy (opcional, local)

Para desarrollo local con caché SQLite:

```bash
# Terminal 1: espejo
cd espejo && go run ./cmd/server

# Terminal 2: proxy (opcional)
cd cliente-local && CGO_ENABLED=0 go run ./cmd/proxy
```

El proxy es útil en LAN o para pruebas; no forma parte del despliegue profesional en la nube.
