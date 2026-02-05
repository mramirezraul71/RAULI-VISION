# Cadena de actualizaciones — RAULI-VISION

**Nota:** La app **no está en Google Play** todavía. La cadena no incluye AAB/Play Store.

## Archivos sincronizados

| Archivo | Propósito |
|---------|-----------|
| `dashboard/package.json` | version (origen para __APP_VERSION__ en build) |
| `render.yaml` | VERSION env (espejo-backend, proxy-backend) |
| `cliente-local/cmd/proxy/main.go` | var version (local dev) |
| `espejo/cmd/server/main.go` | var version (local dev) |
| `dashboard/android/app/build.gradle` | versionCode, versionName (para futuro Play Store) |

## Actualizar la cadena

### Opción 1: Todo (bump + puente Cloudflare + push)
```bash
python scripts/actualizar_cadena.py --todo
```

### Opción 2: Solo bump (fecha de hoy)
```bash
python scripts/bump_version.py --today
```

### Opción 3: Bump + incrementar patch
```bash
python scripts/bump_version.py
```

### Opción 4: Interactivo
```bash
ACTUALIZAR_CADENA.bat
```

### Opción 5: Con opciones
```bash
python scripts/actualizar_cadena.py --push              # bump + git push
python scripts/actualizar_cadena.py --deploy-network    # bump + deploy puente Cloudflare
```

## Flujo de despliegue

1. **Bump** → Actualiza package.json, render.yaml, backends Go, build.gradle
2. **deploy_network** → Despliega puente Cloudflare (puente-rauli-vision.workers.dev)
3. **git push** → Dispara:
   - **Render**: espejo-backend + proxy-backend (VERSION desde render.yaml)
   - **Vercel**: dashboard (desde repo)

## Estructura RAULI-VISION (profesional)

- **Dashboard** (Vercel): React/Vite, version en package.json → __APP_VERSION__
- **espejo-backend** (Render): API Go, único servicio backend
- **Puente Cloudflare**: proxy para Cuba (deploy_network.js)
- *Proxy*: solo para uso local; no forma parte del despliegue cloud
