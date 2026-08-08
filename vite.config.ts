import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /**
         * Which shared modules travel together.
         *
         * Left to itself, Rollup gave every Lucide icon its own file, and one
         * visit to Today fetched 161 JavaScript files - `plus-CTfRJxQ2.js`,
         * `x-kYlEVoGj.js`, `sun-Bt_v1iRG.js` and 130-odd more, each a few
         * hundred bytes with its own request, its own round trip and its own
         * cache entry. Splitting is supposed to defer code nobody is using;
         * splitting per icon defers nothing and costs a request each.
         *
         * Only genuinely shared vendor code is grouped. Route chunks stay
         * separate, which is the split that actually earns its keep.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('react-router')) return 'router';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
})
