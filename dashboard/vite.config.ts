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
      registerType: 'autoUpdate',
      filename: 'sw-v2.js',
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true,
      },
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
  server: { proxy: { '/api': 'http://localhost:3000', '/auth': 'http://localhost:3000', '/owner': 'http://localhost:3000', '/vault': 'http://localhost:3000' } },
})
