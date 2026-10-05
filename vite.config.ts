import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? 'dev') },
  root: 'web',
  plugins: [react(), tailwind()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5180, proxy: { '/api': 'http://localhost:3120' } },
})
