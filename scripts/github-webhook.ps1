#!/usr/bin/env pwsh

# 🌐 Script para GitHub Webhook Integration
# Se ejecuta automáticamente cuando hay push al repo

param(
    [string]$Payload = "",
    [string]$Branch = "main"
)

$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Blue = "Blue"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Process-GitHubWebhook {
    Write-ColorOutput "🌐 Procesando GitHub webhook..." $Blue
    Write-ColorOutput "📦 Branch: $Branch" $Blue
    
    if ($Payload) {
        try {
            $webhookData = $Payload | ConvertFrom-Json
            $commit = $webhookData.head_commit.message
            $author = $webhookData.head_commit.author.name
            
            Write-ColorOutput "📝 Commit: $commit" $Yellow
            Write-ColorOutput "👤 Autor: $author" $Yellow
        } catch {
            Write-ColorOutput "⚠️ Error parsing webhook payload" $Yellow
        }
    }
    
    # Pull latest changes
    Write-ColorOutput "📥 Actualizando desde GitHub..." $Yellow
    git pull origin $Branch
    
    # Run auto-update
    Write-ColorOutput "🚀 Ejecutando actualización automática..." $Blue
    try {
        & ".\scripts\auto-update.ps1" -Environment "production" -SkipTests
        Write-ColorOutput "✅ Webhook procesado exitosamente" $Green
    } catch {
        Write-ColorOutput "❌ Error en webhook processing" $Red
        exit 1
    }
}

# Ejecutar si se llama directamente
if ($MyInvocation.InvocationName -eq $MyInvocation.MyCommand.Name) {
    Process-GitHubWebhook
}
