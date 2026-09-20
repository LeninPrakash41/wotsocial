import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // Only variables on this allowlist are inlined into the client bundle.
  // Previously the entire `process.env` object was defined here, which would
  // now ship META_APP_SECRET, ENCRYPTION_KEY and every other server secret to
  // the browser. Server-side code reads process.env directly at runtime and
  // does not depend on this.
  const CLIENT_SAFE_ENV = ['APP_URL', 'NODE_ENV'] as const;

  const clientEnv = Object.fromEntries(
    CLIENT_SAFE_ENV
      .filter(key => env[key] !== undefined)
      .map(key => [`process.env.${key}`, JSON.stringify(env[key])])
  );

  return {
    plugins: [react(), tailwindcss()],
    define: {
      ...clientEnv,
      // Bare `process.env` reads resolve to an empty object instead of the
      // real environment, so nothing outside the allowlist can leak.
      'process.env': '{}'
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3050,
      strictPort: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3050',
          changeOrigin: true
        }
      }
    },
  };
});
