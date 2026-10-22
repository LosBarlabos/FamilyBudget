import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Családi költségvetés',
        short_name: 'Költségvetés',
        description: 'Havi családi költségvetés tervezése és követése',
        lang: 'hu',
        start_url: './',
        display: 'standalone',
        background_color: '#f7f7f5',
        theme_color: '#2a78d6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Az app ikonján hosszan nyomva (Android, asztali Chrome/Edge) egyből a gyorsrögzítő nyílik.
        shortcuts: [
          {
            name: 'Gyors rögzítés',
            short_name: 'Rögzítés',
            description: 'Egy összeg rögzítése egy keretbe',
            url: './#/attekintes?gyors',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  build: { chunkSizeWarningLimit: 800 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
