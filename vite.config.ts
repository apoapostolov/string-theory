import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_PORT = process.env.ST_API_PORT ?? '4317'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5477,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
