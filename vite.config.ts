import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
