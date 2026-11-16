import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));

export default defineConfig({
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
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});