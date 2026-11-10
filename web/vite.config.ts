import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Ports from the environment, so a second checkout (a worktree) can run beside the first.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: Number(env?.WEB_PORT ?? 5180),
    strictPort: true,
    // What the server and the web app share (`shared/`) is beside this folder, not in it.
    fs: { allow: ['..'] },
    proxy: {
      '/api': `http://localhost:${env?.PORT ?? 8787}`,
    },
  },
  test: {
    environment: 'happy-dom',
  },
})
