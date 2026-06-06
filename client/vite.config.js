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
      // Same-origin proxy — avoids localhost vs 127.0.0.1 CORS issues in dev
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // YES/NO tap links in mock SMS — same port as the admin UI
      '/respond': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
