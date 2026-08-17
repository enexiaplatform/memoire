import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /**
   * An allowlist of what may reach a browser, not a prefix.
   *
   * Vite inlines every `VITE_`-prefixed variable into `import.meta.env`, and
   * Vercel, seeing a Vite project, publishes its own system variables under
   * that same prefix. The result shipped to every visitor of the production
   * site: `VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME`, the repository owner's login,
   * the repo id and slug, the deployment id, and the entire text of the last
   * commit message - build metadata about the person who runs the business,
   * downloaded by anyone who opens the page.
   *
   * Each prefix below is a variable this product actually reads. Anything else
   * - including a secret somebody names `VITE_` by mistake tomorrow - stays out
   * of the bundle unless it is added here on purpose.
   */
  envPrefix: [
    'VITE_APP_',
    'VITE_SUPABASE_',
    'VITE_GOOGLE_',
    'VITE_ENABLE_',
    'VITE_CLIENT_',
    'VITE_FOUNDER_',
  ],
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
