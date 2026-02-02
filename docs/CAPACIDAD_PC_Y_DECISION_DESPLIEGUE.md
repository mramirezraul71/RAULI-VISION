# Capacidad de PC y decisión de despliegue — RAULI-VISION

**Objetivo:** Verificar la capacidad del equipo local y fijar la estrategia de despliegue (local, nube, híbrido) según los recursos disponibles.

---

## 1. Verificación de capacidad de la PC

### 1.1 Resultado del chequeo (ejecutado en el equipo)

| Recurso | Valor medido | Requisito típico RAULI-VISION |
|---------|--------------|------------------------------|
| **CPU (núcleos lógicos)** | 12 | ≥ 2 (Espejo + Proxy en Go son ligeros) |
| **RAM** | ~64 GB | ≥ 2 GB (Go: ~50–150 MB por proceso) |
| **SO** | Microsoft Windows 11 Home | Windows 10/11 o Linux |

**Conclusión:** La PC tiene **capacidad sobrada** para ejecutar Espejo + Proxy + Dashboard (desarrollo) de forma simultánea. Incluso con varios navegadores abiertos y otras aplicaciones, el margen es amplio.

### 1.2 Capacidad orientativa en esta PC

| Escenario | Uso estimado | Comentario |
|-----------|--------------|------------|
| **Solo Espejo + Proxy (run-all.ps1)** | < 5 % CPU, < 500 MB RAM | Uso muy bajo. |
| **+ Dashboard dev (npm run dev)** | < 10 % CPU, < 1,5 GB RAM | Sigue holgado. |
| **+ Docker Compose (espejo + proxy)** | < 10 % CPU, < 1 GB RAM | Similar. |
| **Uso como “servidor” en LAN** | Depende del número de dispositivos | Con 5–10 clientes ligeros (solo dashboard + API), la PC aguanta sin problema. |

---

## 2. Decisión de despliegue tomada

Según la capacidad verificada y el informe [BALANCE_CARGA_Y_VIAS_PUBLICACION.md](BALANCE_CARGA_Y_VIAS_PUBLICACION.md), se aplica lo siguiente.

### 2.1 Uso principal en esta PC (recomendado)

- **Desarrollo y uso local / LAN:** Ejecutar **Espejo + Proxy** en esta PC con `.\scripts\run-all.ps1` (o Docker Compose). El dashboard se sirve desde el proxy en `http://localhost:3000`.
- **Ventaja:** Cero coste de nube; toda la carga la asume esta máquina sin problema.
- **Disponibilidad:** Mientras la PC esté encendida y los servicios en marcha.

### 2.2 Publicación en nube (demo o acceso público)

Se han dejado listas las configuraciones para publicar sin cambiar el stack:

1. **Render (backend Espejo + Proxy)**  
   - **render.yaml** actualizado:
     - **Espejo:** `runtime: go`, `rootDir: espejo`, build/start del binario Go.
     - **Proxy:** `runtime: docker`, `dockerfilePath: cliente-local/Dockerfile`, `dockerContext: cliente-local` (Go con CGO/SQLite).
   - Tras conectar el repo y desplegar, tendrás:
     - `https://espejo-backend.onrender.com`
     - `https://proxy-backend.onrender.com`
   - Si Render asigna otro nombre al servicio espejo, ajustar en el Dashboard de Render la variable `ESPEJO_URL` del proxy para que apunte a la URL correcta del espejo.

2. **Vercel (solo frontend)**  
   - **vercel.json** actualizado:
     - Rutas `/api/*` y `/auth/*` reenviadas a `https://proxy-backend.onrender.com`.
     - `VITE_API_URL` = `https://proxy-backend.onrender.com`.
   - Si tu proxy en Render tiene otra URL (p. ej. dominio propio), cambia en `vercel.json` todas las apariciones de `proxy-backend.onrender.com` por esa URL y vuelve a desplegar.

### 2.3 Modelo híbrido (túnel / bajo ancho de banda)

- **Espejo:** En Render (o VPS) para que esté siempre accesible desde internet.
- **Proxy + Dashboard:** En **esta PC** (o en otra máquina/Raspberry en la red local), con `ESPEJO_URL` apuntando a la URL del espejo en la nube.
- **Ventaja:** Caché local en la PC; menos tráfico por el túnel; esta máquina tiene recursos de sobra para actuar como proxy local.

---

## 3. Resumen de acciones realizadas

| Acción | Estado |
|--------|--------|
| Verificación de capacidad PC (CPU, RAM) | Hecho — 12 núcleos lógicos, ~64 GB RAM |
| Decisión: PC apta para Espejo + Proxy en local / LAN | Aplicada |
| render.yaml: Espejo Go + Proxy Docker (Go/CGO) | Corregido |
| vercel.json: URL backend = proxy-backend.onrender.com | Corregido |
| vercel.json: valor CORS Access-Control-Allow-Methods | Corregido (OPTIONS incluido) |
| Documento de capacidad y decisión | Este documento |

---

## 4. Próximos pasos opcionales

1. **Probar despliegue en Render:** Conectar el repo a Render, importar el Blueprint (`render.yaml`) y comprobar que Espejo y Proxy levantan correctamente.
2. **Probar despliegue en Vercel:** Desplegar el dashboard (directorio `dashboard/`) en Vercel y comprobar que las llamadas a `/api/*` llegan al proxy en Render.
3. **Híbrido:** Dejar el espejo en Render y correr solo el proxy en esta PC con `ESPEJO_URL=https://espejo-backend.onrender.com` para usar la PC como puerta de acceso local con caché.

Con la capacidad actual de la PC, todas las opciones anteriores son viables; la elección depende de si priorizas uso local/LAN, demo pública o modelo túnel con caché en esta máquina.
