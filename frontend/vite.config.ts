import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Cible du proxy /api du serveur de développement : VITE_PROXY_API (variable d'environnement ou frontend/.env), sinon
// l'API locale habituelle, http://localhost:8000. N'a aucun effet sur le build de production (le proxy ne sert qu'au serveur
// de développement ; la production passe par nginx).
export const CIBLE_PROXY_PAR_DEFAUT = 'http://localhost:8000'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const cibleProxy = (process.env.VITE_PROXY_API || env.VITE_PROXY_API || '').trim() || CIBLE_PROXY_PAR_DEFAUT
  return {
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
        target: cibleProxy,
        changeOrigin: true,
      },
    },
  },
  }
})
