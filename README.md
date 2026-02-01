
Cuba Stealth — Protocolo negapro.t (v11) — Full Operations Bundle

Incluye:
- Guía de firmado APK
- Guía de swap de transporte
- Entrenamiento de operador
- Checklists finales de campo

---

## RAULI-VISION — Dashboard unificado y túnel optimizado

Dashboard unificado para entornos de bajo ancho de banda (Cuba): servidor espejo (VPS) + cliente local (proxy + caché) + PWA.

**Documentación:**
- [Arquitectura de alto nivel](docs/ARQUITECTURA_RAULI-VISION.md)
- [Diseño de API](docs/API_RAULI-VISION.md)
- [Estructura de repos y carpetas](docs/ESTRUCTURA_REPOS_RAULI-VISION.md)
- [Guía de usuario](docs/GUIA_USUARIO.md)
- [Despliegue (Docker)](docs/DESPLIEGUE.md)
- [Changelog](CHANGELOG.md)

**Componentes (monorepo):**
- [espejo/](espejo/) — Servidor espejo (VPS): búsqueda, video, IA, compresión Brotli
- [cliente-local/](cliente-local/) — Proxy + caché SQLite; sirve dashboard y reenvía al espejo
- [dashboard/](dashboard/) — PWA (React + Vite): búsqueda, video, chat IA

**Proyecto completo — Cómo ejecutar**

1. **Todo en uno (PowerShell):**  
   `.\scripts\run-all.ps1` — Abre Espejo y Proxy en dos ventanas y el navegador en http://localhost:3000

2. **Dashboard React integrado en el proxy:**  
   `.\scripts\build-dashboard-and-copy.ps1` — Construye el dashboard y lo copia a `cliente-local/static`. Luego ejecute el proxy; en http://localhost:3000 verá el PWA completo.

3. **Paso a paso:**  
   - Terminal 1: `cd espejo` → `go mod tidy` → `go run ./cmd/server`  
   - Terminal 2: `cd cliente-local` → `go mod tidy` → `$env:ESPEJO_URL='http://localhost:8080'; go run ./cmd/proxy`  
   - Navegador: http://localhost:3000 (estático embebido) o, tras `build-dashboard-and-copy.ps1`, el dashboard React.

Más detalles: [docs/EJECUCION_RAULI-VISION.md](docs/EJECUCION_RAULI-VISION.md)
