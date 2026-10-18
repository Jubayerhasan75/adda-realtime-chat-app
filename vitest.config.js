import { defineConfig } from 'vitest/config';

// Runs every package's tests with one `npm test`; each project keeps its own config.
export default defineConfig({
  test: {
    projects: ['shared', 'server', 'client'],
  },
});
