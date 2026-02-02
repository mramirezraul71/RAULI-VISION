# Despliegue Render — Verificación OK

Para comprobar que el despliegue en Render está correcto, ejecuta desde la raíz del repo:

```powershell
.\scripts\verificar-render.ps1
```

El script comprueba:

- **Espejo:** `https://espejo-backend.onrender.com/api/health` → 200 OK  
- **Proxy:** `https://proxy-backend.onrender.com/api/health` → 200 OK  

Si ambos responden 200, verás **DESPLIEGUE RENDER OK**.

**Notas:**

- En plan **free**, los servicios pueden estar dormidos; la primera petición puede tardar **hasta ~90 s** (cold start). El script usa timeout de 90 s.
- Si tus servicios en Render tienen otro nombre, edita `$urlEspejo` y `$urlProxy` en `scripts/verificar-render.ps1`.
- **Autorización de upgrade:** El usuario autoriza subir al plan **Starter (~$7/mes por servicio)** si el sistema se vuelve lento (cold starts, spin-down tras inactividad). Ver sección [Upgrade a Starter](#upgrade-a-starter) más abajo.
- Dashboard de Render: https://dashboard.render.com
- **Notificaciones Telegram:** al redactar fixes, usar **ldflags** (L minúscula), no "Idflags".

**Enlaces del despliegue (según render.yaml):**

| Servicio | URL |
|----------|-----|
| Espejo   | https://espejo-backend.onrender.com |
| Proxy (dashboard + API) | https://proxy-backend.onrender.com |

Cuando el script termine con **DESPLIEGUE RENDER OK**, todo el despliegue en Render está verificado.

---

## Última verificación

| Servicio | URL probada | Resultado típico |
|----------|-------------|------------------|
| Espejo   | espejo-backend.onrender.com | 404 = servicio no existe en esa URL o nombre distinto en Render. Comprueba la URL real en el Dashboard. |
| Proxy    | proxy-backend.onrender.com  | 503 = arrancando (cold start) o no disponible. Espera 1–2 min y vuelve a ejecutar `.\scripts\verificar-render.ps1`. |

**Para que todo quede OK:**  
1. En https://dashboard.render.com revisa los nombres y URLs reales de los servicios.  
2. Si son distintas, edita `scripts/verificar-render.ps1` y pon `$urlEspejo` y `$urlProxy` con las URLs que muestra Render.  
3. Vuelve a ejecutar `.\scripts\verificar-render.ps1` hasta ver **DESPLIEGUE RENDER OK**.

---

## Upgrade a Starter (~$7/mes por servicio)

Si el sistema se vuelve lento por el plan **free** (cold starts, spin-down tras 15 min de inactividad), está autorizado subir a **Starter**:

1. **Desde el Dashboard de Render**  
   - Entra a https://dashboard.render.com → Blueprint **rauli-vision** → Resources.  
   - Para cada servicio (**espejo-backend**, **proxy-backend**): Settings → Instance Type → **Starter** → Save.  
   - Requiere tarjeta en Billing del workspace.

2. **Desde el repo (render.yaml)**  
   - Cambiar en `render.yaml` cada `plan: free` por `plan: starter`.  
   - Commit + push a la rama que usa el Blueprint (p. ej. `master`).  
   - En Render: Blueprint → Manual sync (o esperar al auto-sync).  
   - Requiere tarjeta en Billing del workspace.

Tras el cambio, los servicios permanecen encendidos y evitan cold starts.

---

## Si el despliegue falla ("Despliegue fallido")

Cuando **Espejo** o **Proxy** muestran "Despliegue fallido" en el Dashboard:

1. **Ver el error concreto**  
   - Dashboard → servicio (espejo-backend o proxy-backend) → pestaña **Logs** o **Events**.  
   - En **Events** verás si falló en *Build* o en *Deploy*.  
   - En **Logs** verás la salida del build (go build, docker build) o del arranque (./espejo, ./proxy).

2. **Causas habituales**  
   - **"falta la entrada go.sum" / "cd: espejo: No such file":** Render puede ejecutar el build desde **raíz del repo** o desde rootDir. Solución aplicada: **sin rootDir**, build desde raíz con `go mod download -C espejo` y `go build -C espejo -o espejo/espejo ./cmd/server` (Go 1.20+). Así el módulo se resuelve siempre desde la raíz. `buildFilter.paths: [espejo/**]` limita el redeploy a cambios en espejo.  
   - **Espejo (Go):** dependencias no descargadas → el buildCommand debe incluir `go mod download &&` antes de `go build`.  
   - **Proxy (Go nativo):** usa `CGO_ENABLED=0` y cache en memoria; no requiere Docker ni `cd`.  
   - **Health check:** si el build termina pero el deploy falla, puede ser que `/api/health` no responda a tiempo; el servicio debe escuchar en `PORT` y responder 200 en `healthCheckPath`.

3. **Tras corregir**  
   - Haz commit + push a la rama que usa el Blueprint (p. ej. `master`).  
   - Render hará sync y volverá a desplegar, o en Blueprint → **Manual sync**.
