import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'chat.js',
      name: 'MwaWidget',
      formats: ['iife', 'es'],
      fileName: (format) => `widget.${format === 'iife' ? 'js' : 'mjs'}`,
    },
    minify: true,
  },
  test: {
    environment: 'jsdom',
    include: ['**/*.test.{js,ts}'],
  },
});
