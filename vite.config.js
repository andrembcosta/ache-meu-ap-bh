import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/wfs': {
        target: 'https://bhmap.pbh.gov.br',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/wfs/, '/v2/api/idebhgeo/wfs'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
      // SIATU Edificações — bedroom breakdown (mirrors api/siatu.js in production).
      // Rewrites /api/siatu?id=123 → /edificacoes/api/v1/projetos/123/parametros-urbanisticos
      '/api/siatu': {
        target: 'https://urbano.pbh.gov.br',
        changeOrigin: true,
        rewrite: path => {
          const id = new URL(path, 'http://x').searchParams.get('id')
          return `/edificacoes/api/v1/projetos/${id}/parametros-urbanisticos`
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    },
  },
})
