import react from '@vitejs/plugin-react'
import { cpSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Vite skips dot-prefixed directories when copying public/ to dist/.
// This plugin ensures .well-known/ (and any future dot-dirs) are included.
const copyDotDirs = {
  name: 'copy-dot-dirs',
  closeBundle() {
    const dirs = ['.well-known']
    for (const dir of dirs) {
      const src = resolve(__dirname, `public/${dir}`)
      if (existsSync(src)) cpSync(src, resolve(__dirname, `dist/${dir}`), { recursive: true })
    }
  },
}

export default defineConfig({
  plugins: [react(), copyDotDirs],
  build: {
    // Bundle size optimizations
    target: 'es2020',
    minify: 'terser',

    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.info', 'console.debug'],
      },
    },

    // Warnings for large chunks
    chunkSizeWarningLimit: 100, // KB
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
})
