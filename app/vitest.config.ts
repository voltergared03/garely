import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Default to node; component (.test.tsx) files opt into the DOM with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Coverage denominator = the unit/integration-testable surface: server
      // libs + API route handlers. React pages/components are verified in the
      // browser (component/e2e tests are a roadmap item), so they're excluded
      // here rather than diluting the number with code we don't unit-test yet.
      include: ['src/lib/**', 'src/app/api/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/__mocks__/**', '**/*.d.ts'],
      // vitest 4 removed the `all` flag; the `include` globs above already pull
      // untested files in those dirs into the denominator (the old `all: true`).
      // Regression floor (just under today's numbers). Only enforced on
      // `test:coverage` / CI — raise as coverage grows. `npm test` is unaffected.
      thresholds: { statements: 14, branches: 11, functions: 13, lines: 14 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
