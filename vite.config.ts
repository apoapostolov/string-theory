import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 4317 is the app's port in every mode; in dev this Vite server owns it and
// proxies /api to the API process the supervisor started on 4318.
const WEB_PORT = Number(process.env.ST_WEB_PORT ?? 4317)
const API_PORT = process.env.ST_API_PORT ?? '4318'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: WEB_PORT,
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
