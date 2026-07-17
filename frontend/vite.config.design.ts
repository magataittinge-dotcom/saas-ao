import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Config "mode design" : Clerk stubé, API mockée sur :8000
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@clerk/clerk-react': path.resolve(__dirname, '../../design-harness/clerk-stub.tsx'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
