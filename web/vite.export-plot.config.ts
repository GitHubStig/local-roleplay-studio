import { defineConfig } from 'vite'

/**
 * Observable Plot as one classic script (`dist-export/plot.js`, setting `window.Plot`), for an
 * exported page with style scores: see `src/export/plot.ts`. Built after the page, beside it.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-export',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: 'src/export/plot.ts',
      name: 'Plot',
      formats: ['iife'],
      fileName: () => 'plot.js',
    },
  },
})
