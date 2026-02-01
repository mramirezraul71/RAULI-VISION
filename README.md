
# RAULI-VISION 🚀

**Dashboard unificado y túnel optimizado para entornos de bajo ancho de banda**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)](https://golang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

## 🎯 Descripción

RAULI-VISION es un sistema completo diseñado para operar eficientemente en entornos de baja conectividad, inspirado en el protocolo "CUBA" para máxima resiliencia. Consiste en tres componentes principales que trabajan en conjunto para proporcionar una experiencia de usuario fluida incluso con conexiones limitadas.

## 🏗️ Arquitectura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Espejo (Go)   │◄──►│ Proxy (Python)  │◄──►│ Dashboard (React)│
│   (Backend)     │    │  (Cache + CDN)  │    │   (PWA Frontend) │
│  Puerto 8080    │    │  Puerto 3000    │    │   Modo Offline   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Componentes

- **🔥 Espejo** - Servidor Go con búsqueda, video, IA y compresión Brotli
- **🌐 Cliente-local** - Proxy Python con caché SQLite y CDN integrado
- **📱 Dashboard** - PWA React + TypeScript con modo offline
- **🎵 CAMI Channel** - Sistema profesional de gestión musical

## ✨ Características Principales

### 🌐 Optimizado para Bajo Ancho de Banda
- **Compresión Brotli** - Máxima eficiencia en transferencia
- **Caché Inteligente** - SQLite con persistencia local
- **Modo Offline** - Funcionalidad completa sin conexión
- **PWA** - Instalable como aplicación nativa

### 🔍 Motor de Búsqueda
- **Búsqueda Web Optimizada** - Resultados ligeros y rápidos
- **Video Streaming** - Compresión adaptativa
- **Chat IA** - Resúmenes inteligentes de contenido

### 🎵 Canal CAMI
- **Gestión Musical Profesional** - Upload, metadatos, análisis
- **Sistema Multi-nivel** - Accesos granulares y seguridad
- **Estadísticas Avanzadas** - Reproducciones y engagement

### 📱 Experiencia de Usuario
- **Detección de Conexión** - Notificaciones automáticas offline/online
- **Navegación Intuitiva** - Botón de retorno home siempre visible
- **Diseño Responsivo** - Adaptado para todos los dispositivos

## 🚀 Quick Start

### Prerrequisitos
- Go 1.19+
- Node.js 18+
- Python 3.8+

### Instalación Rápida

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/RAULI-VISION.git
cd RAULI-VISION

# Opción 1: Todo en uno (PowerShell)
.\scripts\run-all.ps1

# Opción 2: Paso a paso
# Terminal 1 - Backend
cd espejo
go mod tidy
go run ./cmd/server

# Terminal 2 - Proxy
cd cliente-local
go mod tidy
python simple-server.py

# Terminal 3 - Frontend
cd dashboard
npm install
npm run build
npm run dev
```

### Acceso
- **Dashboard**: http://localhost:3000
- **API Health**: http://localhost:8080/api/health
- **Búsqueda**: http://localhost:8080/api/search?q=test

## 📚 Documentación

- [📖 Arquitectura](docs/ARQUITECTURA_RAULI-VISION.md) - Diseño técnico detallado
- [🔧 API Reference](docs/API_RAULI-VISION.md) - Documentación de endpoints
- [📁 Estructura](docs/ESTRUCTURA_REPOS_RAULI-VISION.md) - Organización del proyecto
- [👤 Guía de Usuario](docs/GUIA_USUARIO.md) - Manual de uso completo
- [🐳 Despliegue](docs/DESPLIEGUE.md) - Docker y producción
- [🎵 CAMI Channel](docs/CAMI_CHANNEL_ACCESS.md) - Sistema musical profesional

## 🛠️ Tecnologías

### Backend
- **Go** - Servidor principal de alto rendimiento
- **SQLite** - Base de datos ligera para caché
- **Brotli** - Compresión de última generación

### Frontend
- **React 18** - UI moderna y reactiva
- **TypeScript** - Tipado seguro
- **Vite** - Build tool ultrarrápido
- **TailwindCSS** - Estilos optimizados

### Infraestructura
- **PWA** - Progressive Web App
- **Service Worker** - Caché offline
- **Proxy Python** - Middleware flexible

## 🎯 Protocolo "CUBA"

RAULI-VISION implementa el protocolo "CUBA" para máxima resiliencia:

- **C**aching - Almacenamiento inteligente
- **U**ltra-lightweight - Interfaces minimalistas
- **B**andwidth-optimized - Uso eficiente de ancho de banda
- **A**utonomous - Funcionamiento offline

## 📊 Estado del Proyecto

- ✅ **Backend** - Completamente funcional
- ✅ **Frontend** - PWA con modo offline
- ✅ **Canal CAMI** - Sistema musical profesional
- ✅ **Audio** - Sistema de respuestas con voz
- ✅ **Documentación** - Completa y detallada

## 🤝 Contribuir

1. Fork el proyecto
2. Crear una feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit los cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🙏 Agradecimientos

- Protocolo "CUBA" para inspiración en optimización
- Comunidad Go y React por herramientas excelentes
- Todos los contribuyentes y testers

---

**RAULI-VISION** - *Internet curado para entornos de bajo ancho de banda* 🚀
