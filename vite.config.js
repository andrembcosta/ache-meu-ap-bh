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
    },
  },
})
