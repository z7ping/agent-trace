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
      // API 请求代理到生产服务器（安装目录，端口 56789）
      '/api': 'http://localhost:56789',
      '/projects.json': 'http://localhost:56789',
      '/logs': 'http://localhost:56789',
      '/states': 'http://localhost:56789',
    },
  },
});
