/// <reference types="vitest" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', '@supabase/supabase-js'],
          charts: ['recharts'],
          audio: ['wavesurfer.js'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // user is notified of updates (see UpdatePrompt)
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'SoundFont Hub',
        short_name: 'SoundFont Hub',
        description: 'Premium Sounds. Endless Possibilities.',
        theme_color: '#5b3df5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Public catalog reads (products, categories, tutorials, settings). Never auth / rpc / storage-signed.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              /\/rest\/v1\/(soundfonts|categories|tutorials|collections|bundles|supported_applications|system_settings|audio_previews|product_compatibility)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'catalog-v1', networkTimeoutSeconds: 4, expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
          {
            // Public preview audio + cover art only (public buckets). Private buckets & signed URLs are never matched.
            urlPattern: ({ url }) => /\/storage\/v1\/object\/public\/(previews|covers|site)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'media-v1', rangeRequests: true, cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
