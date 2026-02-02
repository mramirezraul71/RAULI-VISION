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
- Dashboard de Render: https://dashboard.render.com

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
