import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The NHL web API does not send CORS headers, so during development Vite proxies
// the same two path prefixes that the Cloudflare Worker (proxy/) and the
// Raspberry Pi server (server/) expose. The frontend only ever talks to
//   <base>/nhl-api/...     -> https://api-web.nhle.com/...
//   <base>/nhl-assets/...  -> https://assets.nhle.com/...
// Base path:
//  - GitHub Pages serves a project repository under /<repo-name>/, so the Pages build
//    sets VITE_BASE=/nhl-led-scoreboard/ (see .github/workflows/deploy.yml).
//  - Everywhere else (dev server, `npm run serve`, the Raspberry Pi) the app lives at
//    the site root, so the default is "/".
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
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
