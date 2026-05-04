import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Tauri expects a fixed port and to fail if not available
  clearScreen: false,
  server: {
    port: 5177,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  optimizeDeps: {
    // @react-pdf/renderer ships an ESM-but-CJS-shaped bundle that
    // depends on `events`, `prop-types`, etc. Without explicit
    // pre-bundling Vite's dev server fails to resolve some of the
    // transitive interop, which manifests as a blank Markdown→PDF
    // tool page in the browser. Production build is unaffected; this
    // is purely a dev-mode fix.
    include: ['@react-pdf/renderer'],
  },
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    // The Markdown→PDF chunk grew to ~1.85 MB after adding
    // @react-pdf/renderer. It's lazy-loaded so only impacts users
    // opening that one tool. Bump the warning threshold accordingly.
    chunkSizeWarningLimit: 2000,
  },
});
