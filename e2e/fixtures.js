import { test as base, expect } from '@playwright/test';
import { autoUnlock } from './helpers.js';

/**
 * Every test's `page` unlocks end-to-end encryption by itself when the app asks (the shared
 * signed-in account, or accounts made in the test). Pages a test opens itself call autoUnlock.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await autoUnlock(page);
    await use(page);
  },
});

export { expect };
