import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'resources/js/site-review.js'),
      output: {
        format: 'es',
        codeSplitting: false,
        entryFileNames: 'site-review.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.some(n => n.endsWith('.css')) || assetInfo.name?.endsWith('.css')) {
            return 'site-review.css';
          }
          return '[name][extname]';
        },
      },
    },
  },
});
