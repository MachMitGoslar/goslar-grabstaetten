import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import Sitemap from 'vite-plugin-sitemap'
import { createHtmlPlugin } from 'vite-plugin-html'
import { importantRoutes } from './src/importantRoutes'

const dynamicRoutes = importantRoutes.filter((route) => route !== '/')

export default defineConfig({
  plugins: [
    react(),
    Sitemap({
      hostname: 'https://friedhof.goslar.de',
      dynamicRoutes,
      generateRobotsTxt: true,
    }),
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          title: 'Friedhof',
          description: 'Goslarer Gräber. Nutze unsere Grabstellensuche oder starte deine Friedhofstour entlang bedeutender Goslarer Gräber',
        },
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router-dom)\//.test(id)) {
            return 'react'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
