# Despliegue RAULI-VISION

Guía para desplegar Espejo y Cliente Local (proxy) con Docker.

## Requisitos

- Docker y Docker Compose
- (Opcional) Dashboard construido y copiado a `cliente-local/static/` para servir la PWA desde el proxy

## Variables de entorno

| Variable | Servicio | Descripción | Por defecto |
|----------|----------|-------------|-------------|
| `JWT_SECRET` | espejo | Secreto para firmar JWT; **cambiar en producción** | valor por defecto |
| `CLIENT_ID` | proxy | Identificador del cliente para auth con espejo | `rauli-local` |
| `CLIENT_SECRET` | proxy | Secreto del cliente; debe coincidir con la lógica del espejo | `rauli-local-secret` |
| `VERSION` | ambos | Versión reportada en `/api/health` | `1.0.0` |

## Docker Compose (recomendado)

Desde la raíz del repositorio:

```bash
# Construir y levantar
docker compose up -d --build

# Espejo: http://localhost:8080
# Proxy (dashboard + API): http://localhost:3000
```

Healthchecks:

- Espejo: `GET http://localhost:8080/api/health`
- Proxy: `GET http://localhost:3000/api/health`

El proxy monta un volumen `proxy-cache` para persistir la base SQLite de caché (`/data/rauli-cache.db`).

## Solo Espejo

```bash
cd espejo
docker build -t rauli-espejo .
docker run -p 8080:8080 -e JWT_SECRET=tu-secreto rauli-espejo
```

## Solo Proxy (Cliente Local)

El proxy necesita un Espejo accesible. Con Compose se usa `ESPEJO_URL=http://espejo:8080`. En host:

```bash
cd cliente-local
docker build -t rauli-proxy .
docker run -p 3000:3000 \
  -e ESPEJO_URL=http://host.docker.internal:8080 \
  -e CLIENT_ID=rauli-local \
  -e CLIENT_SECRET=rauli-local-secret \
  -v rauli-cache-data:/data \
  rauli-proxy
```

## Dashboard estático en el Proxy

1. Construir el dashboard: `cd dashboard && npm run build`
2. Copiar `dashboard/dist/*` a `cliente-local/static/` (por ejemplo con `build-dashboard-and-copy.ps1`)
3. Reconstruir la imagen del proxy: el `Dockerfile` incluye `static/` en el build (embed en Go), así que hay que volver a construir la imagen tras actualizar `static/`.

## Producción

- Definir `JWT_SECRET`, `CLIENT_ID` y `CLIENT_SECRET` fuertes (por ejemplo con un `.env` que no se suba al repo).
- Exponer solo el proxy (puerto 3000) tras un reverse proxy (nginx/traefik) con HTTPS.
- El espejo puede quedar en red interna si el proxy y el espejo están en la misma red Docker.
