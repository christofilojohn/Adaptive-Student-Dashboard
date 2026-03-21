import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The proxy port must match LLM_PORT in start.sh (default: 8080).
// To use a different port, set VITE_LLM_PORT in your .env file.
const LLM_PORT = process.env.VITE_LLM_PORT || '8080';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/v1': {
        target: `http://localhost:${LLM_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  }
})
