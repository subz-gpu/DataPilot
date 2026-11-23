import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, /api requests go to the gateway so the browser sees a single origin
// (no CORS setup needed). For a deployed build, set VITE_API_URL to the gateway's address.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.GATEWAY_URL || 'http://localhost:4000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
  },
});
