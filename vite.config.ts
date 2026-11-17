import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The NHL web API does not send CORS headers, so during development Vite proxies
// the same two path prefixes that the Cloudflare Worker (proxy/) and the
// Raspberry Pi server (server/) expose. The frontend only ever talks to
//   <base>/nhl-api/...     -> https://api-web.nhle.com/...
//   <base>/nhl-assets/...  -> https://assets.nhle.com/...
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/nhl-api': {
        target: 'https://api-web.nhle.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (p) => p.replace(/^\/nhl-api/, ''),
      },
      '/nhl-assets': {
        target: 'https://assets.nhle.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/nhl-assets/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
