import { defineConfig } from 'vitest/config';

// Gerçek veri dosyalarını doğrular: npm run verify
export default defineConfig({
  test: { include: ['verify/**/*.verify.ts'], testTimeout: 300_000, pool: 'forks' },
});
