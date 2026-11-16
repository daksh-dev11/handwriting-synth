import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));

const CSP =
  "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp-meta',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `    <meta http-equiv="Content-Security-Policy" content="${CSP}">\n  </head>`,
      );
    },
  };
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: command === 'build' ? [react(), cspPlugin()] : [react()],
  resolve: {
    alias: {
      '@engine': p('./src/engine/index.ts'),
      '@worker': p('./src/worker'),
      '@pdf': p('./src/pdf'),
      '@canvas': p('./src/canvas'),
      '@store': p('./src/store'),
      '@components': p('./src/components'),
    },
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 400 },
}));