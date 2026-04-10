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
        // index.html EXCLUIDO del precache → siempre va a red
        globPatterns: ['**/*.{js,css,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true,
        // Desactiva el NavigationRoute automático que servía index.html cacheado
        navigateFallback: null,
        // Navegación: NetworkFirst → index.html siempre fresco desde red
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
            handler: 'NetworkFirst' as const,
            options: {
              cacheName: 'navigation-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1 },
            },
          },
        ],
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
  // Dev: Vite proxy hacia el Python en :3000
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/owner': 'http://localhost:3000',
      '/vault': 'http://localhost:3000',
    },
  },
  // Preview (npm run preview): sin esto, /api/* no se reenvía y el dashboard parece "desconectado"
  preview: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/owner': 'http://localhost:3000',
      '/vault': 'http://localhost:3000',
    },
  },
})
