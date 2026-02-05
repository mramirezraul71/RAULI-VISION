# Render — Configuración completa del espejo-backend

## Permisos que necesitas darme (añadir a credenciales)

Crea o edita `credenciales.txt` (o `C:\dev\credenciales.txt`) y añade:

```ini
# Render - RAULI-VISION espejo-backend
RENDER_API_KEY=rnd_xxxxxxxxxxxx
RENDER_DEPLOY_HOOK_ESPEJO=https://api.render.com/deploy/srv-xxx?key=xxx
```

### Cómo obtener cada valor

| Variable | Dónde obtenerla |
|----------|-----------------|
| **RENDER_API_KEY** | [Render → Account Settings → API Keys](https://dashboard.render.com/u/settings#api-keys) → Create API Key |
| **RENDER_DEPLOY_HOOK_ESPEJO** | Después de crear el servicio: Dashboard → espejo-backend → Settings → Deploy Hook → Copy |

---

## Paso 1: Conectar Blueprint en Render (una sola vez)

1. **Sube el código a GitHub** (si no está ya):
   ```bash
   cd c:\dev\RAULI-VISION
   git add .
   git commit -m "chore: render espejo-backend"
   git push origin main
   ```

2. **Ve a Render:** [https://dashboard.render.com](https://dashboard.render.com)

3. **New → Blueprint** (o "Infrastructure as Code")

4. **Conecta el repositorio:**
   - Si no está conectado: "Configure account" → autoriza GitHub
   - Busca el repo **RAULI-VISION** y selecciónalo

5. **Rama:** `main`

6. **Render detectará** el `render.yaml` y creará solo **espejo-backend**

7. **Apply** o **Create resources** — Render creará el servicio

8. **Espera** a que el primer deploy termine (2–5 min)

---

## Paso 2: Obtener el Deploy Hook

1. En el Dashboard de Render, entra en **espejo-backend**
2. **Settings** → busca **Deploy Hook**
3. Copia la URL (ej: `https://api.render.com/deploy/srv-xxx?key=xxx`)
4. Añádela a credenciales como **RENDER_DEPLOY_HOOK_ESPEJO**

---

## Paso 3: Verificar

```powershell
cd c:\dev\RAULI-VISION
.\scripts\verificar-render.ps1
```

O manualmente: [https://espejo-backend.onrender.com/api/health](https://espejo-backend.onrender.com/api/health) → debe responder `{"status":"ok"}`

---

## Flujo de despliegue

| Acción | Comando |
|--------|---------|
| Deploy manual | `python scripts/deploy_render_espejo.py` |
| Después de git push | Render redeploy automático (webhook) |
| Verificar | `.\scripts\verificar-render.ps1` |

---

## Arquitectura final

```
Usuario → Cloudflare (puente-rauli-vision) → espejo-backend (Render)
```

- **Dashboard:** Vercel  
- **API:** espejo-backend en Render  
- **Puente Cuba:** Cloudflare Worker  
