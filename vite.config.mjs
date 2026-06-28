import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: false,
    proxy: {
      // API 请求代理到后端 server.js
      '/api': 'http://localhost:37215',
      '/projects.json': 'http://localhost:37215',
      '/logs': 'http://localhost:37215',
      '/states': 'http://localhost:37215',
    },
  },
});
