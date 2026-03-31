import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: '.vite-temp',
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
});
