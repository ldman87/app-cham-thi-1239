import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Chấm Thi 1239 - Nhóm tác giả: 11A7',
        short_name: 'Chấm Thi 1239',
        description: 'Ứng dụng chấm trắc nghiệm trên điện thoại theo mẫu phiếu Công văn 1239/BGDĐT-QLCL (2025)',
        theme_color: '#1d4ed8',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'vi',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ]
});
