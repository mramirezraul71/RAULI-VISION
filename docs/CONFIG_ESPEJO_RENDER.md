# Configuración final espejo-backend (Render)

## Servicios

| Servicio | Plan/Blueprint | Estado |
|----------|----------------|--------|
| **espejo-backend** | rauli-vision-espejo | Mantener (versión actual) |
| proxy-backend | — | Eliminado (no necesario) |
| rauli-panaderia / rauli-panaderia-1 | — | No tocar (activos) |

## Última versión — debe coincidir con render.yaml

| Parámetro | Valor correcto |
|-----------|----------------|
| **Nombre** | espejo-backend |
| **Repositorio** | mramirezraul71/RAULI-VISION |
| **Rama** | principal (main) |
| **Root Directory** | espejo |
| **Runtime** | Go |
| **Plan / Instance** | **Starter** (512 MB, 0.5 CPU) |
| **Build Command** | `go mod download && go build -ldflags="-s -w" -o espejo ./cmd/server` |
| **Start Command** | `./espejo` |
| **Health Check Path** | `/api/health` |

## Variables de entorno

| Key | Valor |
|-----|-------|
| PORT | 8080 |
| JWT_SECRET | (generateValue) |
| ADMIN_TOKEN | (generateValue) |
| VERSION | 1.0.0 |

## Cambio importante

Si el plan aparece como **Gratis** (Free), cámbialo a **Starter**:

1. En la página del servicio espejo-backend
2. Sección "Tipo de instancia" → **Actualizar**
3. Selecciona **Starter** (no Gratis)

El plan Free provoca cold starts largos y menos estabilidad. Starter mantiene el servicio activo.

## URL en producción

- **Render:** https://espejo-backend.onrender.com
- **Cloudflare:** https://puente-rauli-vision.mramirezraul71.workers.dev → proxy a espejo
