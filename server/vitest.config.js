import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Starting MongoDB (and downloading it on the first run) can take a while.
    hookTimeout: 180_000,
    testTimeout: 20_000,
  },
});
