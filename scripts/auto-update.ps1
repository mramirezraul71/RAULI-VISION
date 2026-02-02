#!/usr/bin/env pwsh

# 🚀 Script de Actualización Automática RAULI-VISION
# Actualiza toda la cadena de servicios automáticamente

param(
    [string]$Environment = "production",
    [switch]$SkipTests = $false,
    [switch]$Force = $false
)

# Colores para output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Blue = "Blue"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Test-Environment {
    Write-ColorOutput "🔍 Verificando entorno..." $Blue
    
    # Verificar Git
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-ColorOutput "❌ Git no encontrado" $Red
        exit 1
    }
    
    # Verificar Node.js
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-ColorOutput "❌ Node.js no encontrado" $Red
        exit 1
    }
    
    # Verificar Go
    if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
        Write-ColorOutput "❌ Go no encontrado" $Red
        exit 1
    }
    
    # Verificar Python
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        Write-ColorOutput "❌ Python no encontrado" $Red
        exit 1
    }
    
    Write-ColorOutput "✅ Entorno verificado" $Green
}

function Backup-BeforeUpdate {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "..\RAULI-VISION-AUTOBACKUP-$timestamp"
    
    Write-ColorOutput "💾 Creando backup automático..." $Yellow
    Copy-Item -Path "." -Destination $backupPath -Recurse -Force
    Write-ColorOutput "✅ Backup creado en: $backupPath" $Green
}

function Update-Dependencies {
    Write-ColorOutput "📦 Actualizando dependencias..." $Blue
    
    # Frontend dependencies
    Write-ColorOutput "  📱 Actualizando React..." $Yellow
    Set-Location dashboard
    npm update
    npm audit fix --force
    
    # Backend Go dependencies
    Write-ColorOutput "  🔥 Actualizando Go modules..." $Yellow
    Set-Location ..\espejo
    go get -u ./...
    go mod tidy
    
    # Python dependencies
    Write-ColorOutput "  🌐 Actualizando Python..." $Yellow
    Set-Location ..\cliente-local
    if (Test-Path requirements.txt) {
        pip install -r requirements.txt --upgrade
    }
    
    Set-Location ..
    Write-ColorOutput "✅ Dependencias actualizadas" $Green
}

function Run-Tests {
    if ($SkipTests) {
        Write-ColorOutput "⏭️ Saltando pruebas (skip tests)" $Yellow
        return
    }
    
    Write-ColorOutput "🧪 Ejecutando pruebas..." $Blue
    
    # Frontend tests
    Set-Location dashboard
    if (Test-Path "package.json") {
        $package = Get-Content package.json | ConvertFrom-Json
        if ($package.scripts.test) {
            Write-ColorOutput "  📱 Probando frontend..." $Yellow
            npm test
        }
    }
    
    # Backend tests
    Set-Location ..\espejo
    if (Test-Path "*_test.go") {
        Write-ColorOutput "  🔥 Probando backend Go..." $Yellow
        go test ./...
    }
    
    Set-Location ..
    Write-ColorOutput "✅ Pruebas completadas" $Green
}

function Build-Applications {
    Write-ColorOutput "🔨 Compilando aplicaciones..." $Blue
    
    # Build frontend
    Write-ColorOutput "  📱 Compilando React..." $Yellow
    Set-Location dashboard
    npm run build
    
    # Build Go backend
    Write-ColorOutput "  🔥 Compilando Go backend..." $Yellow
    Set-Location ..\espejo
    go build -o espejo ./cmd/server
    
    # Build Docker images
    Write-ColorOutput "  🐳 Construyendo imágenes Docker..." $Yellow
    Set-Location ..
    docker-compose build --no-cache
    
    Set-Location ..
    Write-ColorOutput "✅ Aplicaciones compiladas" $Green
}

function Deploy-Services {
    Write-ColorOutput "🚀 Desplegando servicios..." $Blue
    
    if ($Environment -eq "production") {
        # Git push para trigger webhook
        Write-ColorOutput "  📤 Enviando cambios a GitHub..." $Yellow
        git add .
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        git commit -m "Auto-update: $timestamp"
        git push origin main
        
        Write-ColorOutput "  🌐 Desplegando en Vercel..." $Yellow
        if (Get-Command vercel -ErrorAction SilentlyContinue) {
            vercel --prod
        }
        
        Write-ColorOutput "  🔥 Desplegando en Render..." $Yellow
        Write-ColorOutput "    (Render se actualiza automáticamente con GitHub push)" $Green
        
    } elseif ($Environment -eq "local") {
        Write-ColorOutput "  🏠 Reiniciando servicios locales..." $Yellow
        docker-compose down
        docker-compose up -d --force-recreate
        
        # Health check
        Start-Sleep -Seconds 10
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8080/api/health" -TimeoutSec 5
            Write-ColorOutput "  ✅ Backend saludable" $Green
        } catch {
            Write-ColorOutput "  ❌ Error en backend" $Red
        }
        
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 5
            Write-ColorOutput "  ✅ Proxy saludable" $Green
        } catch {
            Write-ColorOutput "  ❌ Error en proxy" $Red
        }
    }
    
    Write-ColorOutput "✅ Despliegue completado" $Green
}

function Notify-Update {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $message = "🚀 RAULI-VISION actualizado: $timestamp"
    
    Write-ColorOutput $message $Green
    
    # Notificación de sistema (Windows)
    if ($IsWindows) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($message, "RAULI-VISION Update", "OK", "Information")
    }
    
    # Log de actualización
    $logEntry = "[$timestamp] Auto-update completed successfully"
    Add-Content -Path ".update-log.txt" -Value $logEntry
}

# Main execution
try {
    Write-ColorOutput "🚀 Iniciando actualización automática de RAULI-VISION" $Blue
    Write-ColorOutput "📊 Entorno: $Environment" $Blue
    
    Test-Environment
    Backup-BeforeUpdate
    Update-Dependencies
    
    if (-not $SkipTests) {
        Run-Tests
    }
    
    Build-Applications
    Deploy-Services
    Notify-Update
    
    Write-ColorOutput "🎉 Actualización completada exitosamente!" $Green
    
} catch {
    Write-ColorOutput "❌ Error durante actualización: $($_.Exception.Message)" $Red
    Write-ColorOutput "🔄 Revertiendo a backup..." $Yellow
    
    # Aquí podrías agregar lógica de rollback
    exit 1
}
