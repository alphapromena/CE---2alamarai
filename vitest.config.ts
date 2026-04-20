import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'dist/**', 'supabase/functions/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, '.'),
      // `server-only` throws at import time outside a React Server Component,
      // which is fine in production but prevents us from unit-testing modules
      // that import it. Stub it to a no-op under vitest.
      'server-only': path.resolve(dirname, 'lib/test-utils/server-only-stub.ts'),
    },
  },
});
