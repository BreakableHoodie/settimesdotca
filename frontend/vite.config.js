import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['@fortawesome/react-fontawesome', '@fortawesome/free-solid-svg-icons', '@fortawesome/free-brands-svg-icons']
        }
      }
    },
    minify: 'esbuild',
    chunkSizeWarningLimit: 600
  },
  esbuild: {
    target: 'es2020',
    drop: ['console', 'debugger'],
    legalComments: 'none'
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
