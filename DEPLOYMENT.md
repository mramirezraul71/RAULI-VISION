# 🚀 Guía de Despliegue RAULI-VISION

## 📦 Estructura Preparada

### ✅ Archivos Creados:
- `vercel.json` - Configuración frontend para Vercel
- `render.yaml` - Configuración backend para Render
- `cliente-local/requirements.txt` - Dependencias Python
- `.env.example` - Variables de entorno ejemplo
- `scripts/deploy-vercel.sh` - Script despliegue Vercel
- `scripts/deploy-render.ps1` - Script despliegue Render

## 🎯 Opción 1: Vercel + Render (Recomendado)

### Paso 1: Backend en Render
```bash
# 1. Crear cuenta en https://render.com
# 2. Conectar repositorio GitHub
# 3. Importar usando render.yaml
# 4. Obtener URLs generadas
```

### Paso 2: Frontend en Vercel
```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Ejecutar script
cd scripts
./deploy-vercel.sh

# 3. Configurar variables de entorno
# - VITE_API_URL: https://tu-backend.onrender.com
```

## 🎯 Opción 2: Solo Vercel (Frontend)

```bash
# Despliegue rápido solo frontend
cd dashboard
npm run build
vercel --prod
```

## 🎯 Opción 3: Local + Docker

```bash
# Usar Docker Compose existente
docker-compose up -d
```

## 🔧 Variables de Entorno

Copiar `.env.example` a `.env` y ajustar:

```bash
cp .env.example .env
# Editar valores según entorno
```

## 📊 Capacidad Esperada

- **Vercel + Render**: 10,000+ usuarios concurrentes
- **Solo Vercel**: Ilimitado frontend
- **Local Docker**: 200-500 usuarios concurrentes

## 🔄 Actualizaciones

### Automáticas (Recomendado)
```bash
# Monitoreo continuo (detecta cambios y actualiza)
./scripts/watch-and-update.ps1

# Actualización manual completa
./scripts/auto-update.ps1

# Quick update (doble clic en Windows)
scripts\quick-update.bat
```

### Manual con GitHub
```bash
# Git push activa webhook automático
git add .
git commit -m "Update: descripción del cambio"
git push origin main
```

### GitHub Actions
- **Push a main**: Deploy automático a producción
- **Pull Request**: Tests y build sin deploy
- **Webhooks**: Notificaciones automáticas

## 🚨 Backup

Se ha creado backup automático en:
`../RAULI-VISION-BACKUP-[FECHA-HORA]`
