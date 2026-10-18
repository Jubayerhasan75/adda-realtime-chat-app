import { execSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = 'http://localhost:4000';

/** Short commit id of this build (Vercel provides it; locally read from git). */
function buildId() {
  if (process.env.APP_BUILD_ID) return process.env.APP_BUILD_ID; // tests
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local';
  }
}

export default defineConfig({
  define: { 'import.meta.env.VITE_APP_BUILD': JSON.stringify(buildId()) },
  plugins: [
    react(),
    tailwindcss(),
    // Installable app (docs/ARCHITECTURE.md §11): our own service worker (src/sw.js) with the
    // list of app files injected at build time. Not active in `npm run dev`.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,woff2,png,svg}'] },
      devOptions: { enabled: false },
      manifest: {
        id: '/',
        name: 'Adda',
        short_name: 'Adda',
        description: 'Private one-to-one chat with your friends.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#592E83',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development too: the browser only talks to :5173 and Vite forwards
    // API and socket traffic to the Express server (docs/ARCHITECTURE.md §2).
    proxy: {
      '/api': API_TARGET,
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
  test: {
    name: 'client',
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./src/test/setup.js'],
  },
});
