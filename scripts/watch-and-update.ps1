#!/usr/bin/env pwsh

# 🔄 Script de Monitoreo y Actualización Automática
# Detecta cambios y ejecuta actualización automáticamente

param(
    [int]$IntervalSeconds = 30,
    [string]$Environment = "production",
    [switch]$SkipTests = $false
)

$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Blue = "Blue"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Get-ProjectHash {
    # Calcular hash de todos los archivos importantes
    $files = @(
        "dashboard/package.json",
        "dashboard/src/**/*",
        "espego/go.mod",
        "espejo/**/*.go",
        "cliente-local/**/*.py",
        "docker-compose.yml",
        "vercel.json",
        "render.yaml"
    )
    
    $hash = ""
    foreach ($file in $files) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw
            $hash += $content | Get-FileHash -Algorithm SHA256 | Select-Object -ExpandProperty Hash
        }
    }
    
    return $hash | Get-FileHash -Algorithm SHA256 | Select-Object -ExpandProperty Hash
}

function Start-Watcher {
    Write-ColorOutput "👁️ Iniciando monitor de cambios..." $Blue
    Write-ColorOutput "⏱️ Intervalo: $IntervalSeconds segundos" $Blue
    Write-ColorOutput "🎯 Entorno: $Environment" $Blue
    
    $lastHash = Get-ProjectHash
    Write-ColorOutput "📊 Hash inicial: $lastHash" $Green
    
    while ($true) {
        Start-Sleep -Seconds $IntervalSeconds
        
        $currentHash = Get-ProjectHash
        
        if ($currentHash -ne $lastHash) {
            Write-ColorOutput "🔄 Cambios detectados!" $Yellow
            Write-ColorOutput "📊 Hash anterior: $lastHash" $Yellow
            Write-ColorOutput "📊 Hash nuevo: $currentHash" $Yellow
            
            Write-ColorOutput "🚀 Ejecutando actualización automática..." $Blue
            
            # Ejecutar script de actualización
            $updateScript = ".\scripts\auto-update.ps1"
            $args = @("-Environment", $Environment)
            if ($SkipTests) { $args += "-SkipTests" }
            
            try {
                & $updateScript @args
                $lastHash = $currentHash
                Write-ColorOutput "✅ Actualización completada, continuando monitoreo..." $Green
            } catch {
                Write-ColorOutput "❌ Error en actualización automática" $Red
                Write-ColorOutput "🔄 Continuando monitoreo..." $Yellow
            }
        } else {
            Write-ColorOutput "✅ Sin cambios - $(Get-Date -Format 'HH:mm:ss')" $Green
        }
    }
}

# Iniciar monitoreo
try {
    Start-Watcher
} catch {
    Write-ColorOutput "❌ Error en monitor: $($_.Exception.Message)" $Red
    exit 1
}
