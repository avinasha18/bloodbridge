import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    port: 5173,
    proxy: {
      // Forward /api/* to uvicorn as-is (backend mounts routes under /api)
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // YES/NO tap links in mock SMS — same port as the admin UI
      '/respond': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
