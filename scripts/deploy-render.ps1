# Deploy RAULI-VISION to Render
Write-Host "🚀 Desplegando RAULI-VISION en Render..."

# Check if render.yaml exists
if (-not (Test-Path "render.yaml")) {
    Write-Host "❌ render.yaml no encontrado"
    exit 1
}

# Push to GitHub (required for Render)
Write-Host "📦 Preparando repositorio..."
git add .
git commit -m "Deploy to Render - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push origin main

Write-Host "✅ Código enviado a GitHub"
Write-Host "🌐 Conecta tu repositorio en https://dashboard.render.com"
Write-Host "📋 Importa usando render.yaml"
