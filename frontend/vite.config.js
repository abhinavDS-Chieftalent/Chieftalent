import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Build output is served by Flask from app/static/spa/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/static/spa/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: '../app/static/spa',
    emptyOutDir: true,
  },
})
