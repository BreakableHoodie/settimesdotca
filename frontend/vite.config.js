import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
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

  // Production optimizations
  esbuild: {
    drop: ['console', 'debugger'],
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
