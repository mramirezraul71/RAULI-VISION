# RAULI-VISION — Cómo ejecutar el proyecto

## Requisitos

- **Go 1.22+** (espejo y cliente-local)
- **Node.js 18+** y **npm** (dashboard)
- **CGO** habilitado en Windows para SQLite (cliente-local): normalmente ya está en Go con `mattn/go-sqlite3`

## Opción 1: Todo en local (desarrollo)

### 1. Servidor espejo (puerto 8080)

```powershell
cd espejo
go mod tidy
go run ./cmd/server
```

Variables opcionales: `PORT=8080`, `JWT_SECRET=...`

### 2. Cliente local / proxy (puerto 3000)

En otra terminal:

```powershell
cd cliente-local
go mod tidy
$env:ESPEJO_URL = "http://localhost:8080"
$env:CLIENT_ID = "rauli-local"
$env:CLIENT_SECRET = "rauli-local-secret"
go run ./cmd/proxy
```

El proxy sirve un dashboard estático embebido en `http://localhost:3000`. También expone la API en `http://localhost:3000/api/*`.

### 3. Dashboard (desarrollo con Vite, opcional)

Si quiere trabajar en el frontend con recarga en caliente:

```powershell
cd dashboard
npm install
npm run dev
```

Vite usará el proxy configurado en `vite.config.ts` hacia `http://localhost:3000` para `/api` y `/auth`. Asegúrese de que el proxy (paso 2) esté corriendo.

**Resumen:** Espejo (8080) → Proxy (3000) sirve API + estático. Dashboard en dev (5173) llama al proxy (3000) vía Vite proxy.

## Opción 2: Dashboard integrado en el proxy (producción)

1. Construir el dashboard:

```powershell
cd dashboard
npm install
npm run build
```

2. Copiar el build al proxy:

```powershell
# Desde la raíz del proyecto
Remove-Item cliente-local\static\* -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Recurse dashboard\dist\* cliente-local\static\
```

3. Reconstruir y ejecutar el proxy:

```powershell
cd cliente-local
go build -o rauli-proxy.exe ./cmd/proxy
.\rauli-proxy.exe
```

4. Abrir `http://localhost:3000` en el navegador. El proxy sirve el dashboard (React) y la API.

## Opción 3: Scripts PowerShell (desde la raíz)

- **Espejo:** `.\scripts\run-espejo.ps1`
- **Proxy:** `.\scripts\run-proxy.ps1` (con espejo ya corriendo)
- **Dashboard (solo dev):** `.\scripts\run-dashboard-dev.ps1`

## Proyecto completo en un comando

Desde la raíz del repositorio (con Go y Node en PATH):

1. **Integrar dashboard en el proxy (una vez):**  
   `.\scripts\build-dashboard-and-copy.ps1`  
   Requiere: `npm install` y `npm run build` en `dashboard/`; copia `dashboard/dist/*` a `cliente-local/static/`.

2. **Arrancar todo:**  
   `.\scripts\run-all.ps1`  
   Abre dos ventanas (Espejo y Proxy) y el navegador en http://localhost:3000. Si ejecutó el paso 1, verá el dashboard React completo; si no, el estático mínimo.

## Verificación rápida

1. Espejo: `curl http://localhost:8080/api/health` → `{"status":"ok"}`
2. Proxy (con espejo): `curl http://localhost:3000/api/health` → `{"status":"ok"}` o `{"status":"ok","proxy":"ok","espejo":"unreachable"}` si el espejo está caído
3. Dashboard: abrir `http://localhost:3000` (proxy con estático) o `http://localhost:5173` (Vite dev con proxy configurado)

## Credenciales (desarrollo)

- Espejo: cualquier `client_id` + `client_secret` no vacíos para obtener JWT en `POST /auth/token`.
- Proxy: por defecto usa `CLIENT_ID=rauli-local` y `CLIENT_SECRET=rauli-local-secret`; debe coincidir con lo que el espejo acepte (en el código actual el espejo acepta cualquier par no vacío).
