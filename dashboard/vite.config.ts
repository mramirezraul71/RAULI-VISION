import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// @ts-expect-error JSON import
import pkg from './package.json'

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
      manifest: {
        name: 'RAULI-VISION',
        short_name: 'RAULI-VISION',
        description: 'Dashboard unificado para entornos de bajo ancho de banda',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
      },
    }),
  ],
  server: { 
    port: 3000,
    host: true,
    proxy: { '/api': 'http://localhost:3000', '/auth': 'http://localhost:3000' } 
  },
})
