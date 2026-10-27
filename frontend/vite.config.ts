import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Les icônes (lucide-react) sont partagées par presque tous les écrans : sans regroupement,
        // chaque icône devient un petit morceau à part (35 requêtes de 300 à 700 octets).
        manualChunks(id: string) {
          if (id.includes('node_modules/lucide-react')) return 'icones'
        },
      },
    },
  },
  server: {
    port: 3000,
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
