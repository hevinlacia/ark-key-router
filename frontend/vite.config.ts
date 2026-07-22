import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8789',
      '/v1': 'http://127.0.0.1:8789',
      '/health': 'http://127.0.0.1:8789',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
