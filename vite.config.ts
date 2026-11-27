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
 * Production: uses a generated nonce for inline scripts (removes 'unsafe-inline')
 * Dev: keeps 'unsafe-inline' + 'unsafe-eval' for HMR
 * Tauri: adds its own CSP header with nonce for bootstrap script.
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

function buildCspBase(miniAppOrigins: string): string {
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

function buildCsp(miniAppOrigins: string, nonce?: string): string {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' blob:`
    : "script-src 'self' 'unsafe-inline' blob:";
  return `${buildCspBase(miniAppOrigins)}; ${scriptSrc}`;
}

function generateNonce(): string {
  // Generate a random base64 nonce (128 bits = 16 bytes = 24 base64 chars)
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

function cspPlugin(prodCsp: string, devCsp: string): Plugin {
  let prodNonce: string | undefined;
  return {
    name: 'nova-csp',
    configResolved() {
      // Generate nonce once at build time for production
      prodNonce = generateNonce();
    },
    transformIndexHtml(html, ctx) {
      const isDev = !!ctx.server;
      const nonce = isDev ? undefined : prodNonce;
      const frameOrigins = prodCsp.match(/frame-src 'self' blob:([^;]+)/)?.[1]?.trim() ?? '';
      const csp = isDev ? devCsp : buildCsp(frameOrigins, nonce);

      let transformedHtml = html;

      // Remove any existing CSP meta tag to avoid duplicates
      transformedHtml = transformedHtml.replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*>/g,
        ''
      );

      // Inject new CSP meta tag at the start of head
      transformedHtml = transformedHtml.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`
      );

      // Add nonce to inline scripts in production
      if (!isDev && nonce) {
        // Add nonce to all inline script tags (those without src and without type="module")
        transformedHtml = transformedHtml.replace(
          /<script(?![^>]*\b(src|type="module")[^>]*)>/g,
          `<script nonce="${nonce}">`
        );
      }

      return transformedHtml;
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const frameOrigins = miniAppFrameOrigins(env.VITE_MINI_APP_ORIGINS ?? 'https://mess.cvr.name')
    .map((origin) => ` ${origin}`)
    .join('');
  const sharedCsp = buildCspBase(frameOrigins);
  // Production CSP: no 'unsafe-inline' for scripts (uses nonce), dev CSP: allows inline/eval for HMR
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
            // Large internal modules - main screens
            if (/\/components\/ChatScreen\.tsx/.test(id)) return 'ChatScreen';
            if (/\/components\/ChatsScreen\.tsx/.test(id)) return 'ChatsScreen';
            if (/\/components\/MeshMap\.tsx/.test(id)) return 'MeshMap';
            if (/\/components\/SettingsModal\.tsx/.test(id)) return 'SettingsModal';
            if (/\/components\/AnonymousMessengerScreen\.tsx/.test(id)) return 'AnonymousMessenger';
            if (/\/features\/sites\/SitesScreen\.tsx/.test(id)) return 'SitesScreen';
            if (/\/lib\/bots\/runtime\.ts/.test(id)) return 'bots-runtime';
            if (/\/examples\/bots\/movie-catalog\//.test(id)) return 'movie-catalog';
            if (/\/examples\/bots\/novafather\//.test(id)) return 'novafather';
// ChatScreen sub-components (split for caching, not lazy loaded at runtime)
            if (/\/components\/chat\/StickerPickerDrawer\.tsx/.test(id)) return 'StickerPickerDrawer';
            if (/\/components\/FileSelectionModal\.tsx/.test(id)) return 'FileSelectionModal';
            if (/\/components\/PollCreateModal\.tsx/.test(id)) return 'PollCreateModal';
            if (/\/components\/LocationPickerModal\.tsx/.test(id)) return 'LocationPickerModal';
if (/\/components\/MiniAppIframe\.tsx/.test(id)) return 'MiniAppIframe';
            if (/\/components\/VoiceMemoInput\.tsx/.test(id)) return 'VoiceMemoInput';
            if (/\/components\/DoodleBackground\.tsx/.test(id)) return 'DoodleBackground';
            if (/\/components\/AudioWaveformPlayer\.tsx/.test(id)) return 'AudioWaveformPlayer';
            if (/\/components\/VirtualizedList\.tsx/.test(id)) return 'VirtualizedList';
            if (/\/components\/chat\/MessageHoverActions\.tsx/.test(id)) return 'MessageHoverActions';
            if (/\/components\/FirstContactWarning\.tsx/.test(id)) return 'FirstContactWarning';
            if (/\/components\/chat\/PollBubble\.tsx/.test(id)) return 'PollBubble';
            if (/\/components\/chat\/LocationBubble\.tsx/.test(id)) return 'LocationBubble';
            if (/\/components\/chat\/StickerMedia\.tsx/.test(id)) return 'StickerMedia';
            if (/\/components\/chat\/ChatTextInput\.tsx/.test(id)) return 'ChatTextInput';
            if (/\/components\/chat\/ChatHeader\.tsx/.test(id)) return 'ChatHeader';
            if (/\/components\/MessageInlineKeyboard\.tsx/.test(id)) return 'MessageInlineKeyboard';
            if (/\/components\/MiniAppIframe\.tsx/.test(id)) return 'MiniAppIframe';
            if (/\/components\/chat\/MessageBubble\.tsx/.test(id)) return 'MessageBubble';
            if (/\/components\/chat\/MessageContent\.tsx/.test(id)) return 'MessageContent';
            if (/\/components\/chat\/ReplyPreview\.tsx/.test(id)) return 'ReplyPreview';
            if (/\/components\/chat\/ForwardTag\.tsx/.test(id)) return 'ForwardTag';
            if (/\/components\/chat\/ViaBotTag\.tsx/.test(id)) return 'ViaBotTag';
            if (/\/components\/chat\/Reactions\.tsx/.test(id)) return 'Reactions';
            if (/\/components\/chat\/MessageStatus\.tsx/.test(id)) return 'MessageStatus';
            if (/\/components\/chat\/MediaPreview\.tsx/.test(id)) return 'MediaPreview';
            if (/\/components\/chat\/VideoPlayer\.tsx/.test(id)) return 'VideoPlayer';
            if (/\/components\/LazyMedia\.tsx/.test(id)) return 'LazyMedia';
            if (/\/components\/WallpaperSettingsModal\.tsx/.test(id)) return 'WallpaperSettingsModal';
            if (/\/components\/ScheduleMessageModal\.tsx/.test(id)) return 'ScheduleMessageModal';
            if (/\/components\/VideoCallOverlay\.tsx/.test(id)) return 'VideoCallOverlay';
            if (/\/components\/GroupVideoCallOverlay\.tsx/.test(id)) return 'GroupVideoCallOverlay';
            if (/\/components\/OnboardingWizard\.tsx/.test(id)) return 'OnboardingWizard';
            if (/\/components\/ProfileScreen\.tsx/.test(id)) return 'ProfileScreen';
            if (/\/components\/SanctionScreen\.tsx/.test(id)) return 'SanctionScreen';
            if (/\/components\/BottomNav\.tsx/.test(id)) return 'BottomNav';
            if (/\/components\/Sidebar\.tsx/.test(id)) return 'Sidebar';
            if (/\/components\/ChannelScreen\.tsx/.test(id)) return 'ChannelScreen';
            if (/\/components\/ContactsScreen\.tsx/.test(id)) return 'ContactsScreen';
            if (/\/components\/SettingsModal\.tsx/.test(id)) return 'SettingsModal';
            if (/\/components\/SharedMediaSection\.tsx/.test(id)) return 'SharedMediaSection';
            if (/\/lib\/p2p\/mediaCall\.ts/.test(id)) return 'mediaCall';
            if (/\/lib\/p2p\/groupCall\.ts/.test(id)) return 'groupCall';
            if (/\/lib\/p2p\/fileTransfer\.ts/.test(id)) return 'fileTransfer';
            if (/\/lib\/p2p\/signaling\.ts/.test(id)) return 'signaling';
            if (/\/lib\/p2p\/roomChannel\.ts/.test(id)) return 'roomChannel';
            if (/\/lib\/crypto\//.test(id)) return 'crypto';
            if (/\/lib\/anon\/signing\.(js|ts)$/.test(id)) return 'signing';
            if (/\/lib\/anon\//.test(id)) return 'anon';
            if (/\/lib\/media\//.test(id)) return 'media';
            if (/\/lib\/notifications\//.test(id)) return 'notifications';
            if (/\/lib\/social\//.test(id)) return 'social';
            if (/\/hooks\//.test(id)) return 'hooks';
            // Locales (loaded on demand)
            if (/\/locales\//.test(id)) {
              const match = id.match(/\/locales\/([^\/]+)\.json$/);
              if (match) return `locale-${match[1]}`;
              return 'locales';
            }
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
      host: '127.0.0.1',
      port: 3001,
      hmr: process.env.DISABLE_HMR !== 'true' ? { protocol: 'ws', host: '127.0.0.1', port: 3001, clientPort: 0 } : false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
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