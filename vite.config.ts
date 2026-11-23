import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import compression from 'vite-plugin-compression';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * CSP is injected here instead of being hard-coded in index.html so dev can
 * allow Vite's inline/eval tooling while production builds do not.
 *
 * `script-src` keeps `'unsafe-inline'` in production because Tauri injects its
 * bootstrap script inline; the actual restriction comes from the Tauri CSP
 * header, which Tauri extends with a nonce/hash for that script.
 * `connect-src` must include the IPC origins or every Tauri command is blocked.
 */
/** Mini App hosts are an operator allowlist, never an arbitrary per-bot host. */
function miniAppFrameOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => {
      try {
        const url = new URL(value.trim());
        if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
          return null;
        }
        return url.origin;
      } catch {
        return null;
      }
    })
    .filter((origin): origin is string => Boolean(origin));
}

function buildCsp(miniAppOrigins: string): string {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https: asset: http://asset.localhost",
    "media-src 'self' blob: https: asset: http://asset.localhost",
    "frame-src 'self' blob:" + miniAppOrigins,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function cspPlugin(prodCsp: string, devCsp: string): Plugin {
  return {
    name: 'nova-csp',
    transformIndexHtml(_html, ctx) {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: ctx.server ? devCsp : prodCsp,
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const frameOrigins = miniAppFrameOrigins(env.VITE_MINI_APP_ORIGINS ?? 'https://mess.cvr.name')
    .map((origin) => ` ${origin}`)
    .join('');
  const sharedCsp = buildCsp(frameOrigins);
  const prodCsp = `${sharedCsp}; script-src 'self' 'unsafe-inline' blob:; connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost https: wss: data:`;
  const devCsp = `${sharedCsp}; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost http: https: ws: wss: data:`;

  const isBuild = command === 'build';
  const isAnalyze = process.env.ANALYZE === 'true';

  return {
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin(prodCsp, devCsp),
      // Service Worker for offline caching and faster loads (production only)
      isBuild && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt'],
        manifest: {
          name: 'Nova Dark Messenger',
          short_name: 'Nova',
          description: 'Secure decentralized messenger',
          theme_color: '#090a0e',
          background_color: '#090a0e',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
        },
      }),
      // Gzip + Brotli compression for production
      isBuild && compression({ algorithm: 'gzip', ext: '.gz', threshold: 1024 }),
      isBuild && compression({ algorithm: 'brotliCompress', ext: '.br', threshold: 1024 }),
      // Bundle analyzer (run with ANALYZE=true npm run build)
      isAnalyze && visualizer({ open: true, filename: 'dist/stats.html', gzipSize: true, brotliSize: true }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      cssCodeSplit: true,
      modulePreload: {
        polyfill: true,
      },
      rollupOptions: {
        output: {
          // Stable chunk names for long-term caching
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id: string) {
            // Core framework
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
            // I18n runtime
            if (/node_modules[\\/](i18next|react-i18next)[\\/]/.test(id)) return 'i18n';
            // Lucide icons (tree-shaken but group for caching)
            if (/node_modules[\\/]lucide-react[\\/]/.test(id)) return 'lucide';
            // Crypto libraries
            if (/node_modules[\\/]@noble[\\/]/.test(id)) return 'crypto';
            if (/node_modules[\\/]@scure[\\/]/.test(id)) return 'crypto';
            // Leaflet maps (heavy, lazy loaded)
            if (/node_modules[\\/]leaflet[\\/]/.test(id)) return 'leaflet';
            if (/node_modules[\\/]react-leaflet[\\/]/.test(id)) return 'leaflet';
            // Motion animations
            if (/node_modules[\\/]motion[\\/]/.test(id)) return 'motion';
            // AI SDK
            if (/node_modules[\\/]ai[\\/]/.test(id)) return 'ai';
            // QR code
            if (/node_modules[\\/]qrcode[\\/]/.test(id)) return 'qrcode';
            // Large internal modules
            if (/\/components\/ChatScreen\.tsx/.test(id)) return 'ChatScreen';
            if (/\/components\/ChatsScreen\.tsx/.test(id)) return 'ChatsScreen';
            if (/\/components\/MeshMap\.tsx/.test(id)) return 'MeshMap';
            if (/\/components\/SettingsModal\.tsx/.test(id)) return 'SettingsModal';
            if (/\/components\/AnonymousMessengerScreen\.tsx/.test(id)) return 'AnonymousMessenger';
            if (/\/features\/sites\/SitesScreen\.tsx/.test(id)) return 'SitesScreen';
            if (/\/lib\/bots\/runtime\.ts/.test(id)) return 'bots-runtime';
            if (/\/examples\/bots\/movie-catalog\//.test(id)) return 'movie-catalog';
            if (/\/examples\/bots\/novafather\//.test(id)) return 'novafather';
            // Locales (loaded on demand)
            if (/\/locales\//.test(id)) return 'locales';
            return undefined;
          },
        },
      },
      // Enable minification
      minify: 'esbuild',
      esbuild: {
        drop: ['console', 'debugger'],
        pure: ['console.log'],
      },
      // Reduce chunk size warnings
      chunkSizeWarningLimit: 300,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
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