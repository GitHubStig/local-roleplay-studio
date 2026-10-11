import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * The exported comparison page as one HTML file, its script and styles inlined so it opens from
 * disk (file://) as well as from any host. The server builds it on each export.
 */
export default defineConfig({
  plugins: [vue(), tailwindcss(), viteSingleFile()],
  // No favicon or other files beside it: the page is all there is.
  publicDir: false,
  build: {
    outDir: 'dist-export',
    emptyOutDir: true,
    rollupOptions: { input: 'export.html' },
  },
})
