import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages sirve el sitio en https://macko21.github.io/NURA/
  base: '/NURA/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
  },
});
