import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/**
 * CSP is injected here instead of being hard-coded in index.html so dev can
 * allow Vite's inline/eval tooling while production builds do not.
 *
 * `script-src` keeps `'unsafe-inline'` in production because Tauri injects its
 * bootstrap script inline; the actual restriction comes from the Tauri CSP
 * header, which Tauri extends with a nonce/hash for that script.
 * `connect-src` must include the IPC origins or every Tauri command is blocked.
 */
const SHARED_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: asset: http://asset.localhost",
  "media-src 'self' blob: https: asset: http://asset.localhost",
  "frame-src 'self' https: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const PROD_CSP = `${SHARED_CSP}; script-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost https: wss:`;
const DEV_CSP = `${SHARED_CSP}; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost http: https: ws: wss:`;

function cspPlugin(): Plugin {
  return {
    name: 'nova-csp',
    transformIndexHtml(_html, ctx) {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: ctx.server ? DEV_CSP : PROD_CSP,
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), cspPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Keep the framework and i18n runtime in stable chunks so app releases
          // don't invalidate them in the browser cache.
          manualChunks(id: string) {
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
            if (/node_modules[\\/](i18next|react-i18next)[\\/]/.test(id)) return 'i18n';
            return undefined;
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // In dev, proxy API calls to the local relay/premium backend so the app
      // talks to a same-origin URL and is not blocked by the production CSP.
      proxy: {
        '/api': { target: 'http://localhost:8080', changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      globals: true,
    },
  };
});
