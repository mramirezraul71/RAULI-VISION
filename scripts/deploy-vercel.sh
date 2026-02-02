#!/bin/bash

echo "🚀 Desplegando RAULI-VISION en Vercel..."

# Build frontend
cd dashboard
npm install
npm run build

# Deploy to Vercel
vercel --prod

echo "✅ Frontend desplegado en Vercel"
echo "📝 No olvides actualizar VITE_API_URL en tu backend"
