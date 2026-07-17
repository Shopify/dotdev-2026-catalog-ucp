import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SPA builds to dist/client; the Node server (dist/server) serves it in prod.
// In dev, Vite proxies /api to the Node server on :3100.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3100', changeOrigin: true },
    },
  },
});
