# 📜 Scripts de Automatización RAULI-VISION

## 🚀 Scripts Principales

### `auto-update.ps1`
**Actualización completa automatizada**
```powershell
# Producción con pruebas
./scripts/auto-update.ps1

# Desarrollo sin pruebas
./scripts/auto-update.ps1 -Environment "local" -SkipTests

# Forzar actualización
./scripts/auto-update.ps1 -Force
```

**Características:**
- ✅ Backup automático antes de actualizar
- ✅ Actualización de dependencias (npm, go, pip)
- ✅ Ejecución de pruebas
- ✅ Compilación de todos los componentes
- ✅ Deploy automático a Vercel/Render
- ✅ Notificaciones del sistema

### `watch-and-update.ps1`
**Monitoreo continuo de cambios**
```powershell
# Monitoreo cada 30 segundos (default)
./scripts/watch-and-update.ps1

# Monitoreo cada 10 segundos
./scripts/watch-and-update.ps1 -IntervalSeconds 10

# Entorno de desarrollo
./scripts/watch-and-update.ps1 -Environment "local"
```

**Características:**
- 👁️ Detecta cambios en archivos clave
- 🔄 Ejecuta auto-update automáticamente
- 📊 Hash-based change detection
- ⏱️ Intervalo configurable

### `github-webhook.ps1`
**Procesamiento de webhooks de GitHub**
```powershell
# Ejecución manual
./scripts/github-webhook.ps1 -Branch "main"

# Con payload específico
./scripts/github-webhook.ps1 -Payload $jsonPayload
```

**Características:**
- 🌐 Se integra con GitHub webhooks
- 📥 Pull automático de cambios
- 🚀 Trigger de actualización automática

### `quick-update.bat`
**Actualización rápida (Windows)**
```
# Doble clic en el archivo
scripts\quick-update.bat
```

**Características:**
- 🖱️ Ejecución con doble clic
- ⚡ Actualización rápida sin pruebas
- 🪟 Interfaz amigable para Windows

## 🔄 Flujo de Actualización

### 1. Desarrollo Local
```bash
# Opción 1: Monitoreo continuo
./scripts/watch-and-update.ps1 -Environment "local"

# Opción 2: Actualización manual
./scripts/auto-update.ps1 -Environment "local"
```

### 2. Producción Automática
```bash
# Monitoreo en producción
./scripts/watch-and-update.ps1 -Environment "production"
```

### 3. GitHub Integration
- **Push** → GitHub Actions → Deploy automático
- **Webhook** → `github-webhook.ps1` → Actualización

## 📋 Variables de Entorno

Las scripts usan estas variables:
- `Environment`: `production` | `local`
- `SkipTests`: `$true` | `$false`
- `Force`: Forzar actualización completa
- `IntervalSeconds`: Segundos entre checks (default: 30)

## 🛡️ Seguridad

- ✅ Backup automático antes de cada actualización
- ✅ Verificación de entorno antes de ejecutar
- ✅ Rollback automático en caso de error
- ✅ Logs de todas las operaciones

## 📊 Monitoreo

### Logs generados:
- `.update-log.txt`: Historial de actualizaciones
- `../RAULI-VISION-AUTOBACKUP-*`: Backups automáticos

### Notificaciones:
- 🪟 Notificaciones del sistema (Windows)
- 📊 Salida coloreada en consola
- 📝 Logs detallados de cada paso

## 🚀 Uso Recomendado

### Para desarrollo:
```bash
# Iniciar monitoreo continuo
./scripts/watch-and-update.ps1 -Environment "local" -IntervalSeconds 15
```

### Para producción:
```bash
# Monitoreo con pruebas completas
./scripts/watch-and-update.ps1 -Environment "production"
```

### Para actualizaciones rápidas:
```bash
# Doble clic en quick-update.bat
scripts\quick-update.bat
```
