import { expect, test } from './fixtures.js';

// Rebuilds client/dist to simulate a new deploy, so it runs on its own after every other test
// (its own Playwright project) — never while other tests are loading the app.
test('a new deploy reaches open apps: banner → Update → new version running', async ({ page }) => {
  test.setTimeout(180_000);
  const { execSync } = await import('node:child_process');
  await page.goto('/settings/about');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByText(/Adda \d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByText(/build e2e-new-version/)).toHaveCount(0);

  // "Deploy" a new version while the app is open (the test server serves client/dist).
  execSync('npm run build -w client', {
    env: { ...process.env, APP_BUILD_ID: 'e2e-new-version' },
    stdio: 'ignore',
  });

  // Coming back to the app checks for updates.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const banner = page.getByRole('status').filter({ hasText: 'A new version of Adda is ready.' });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await banner.getByRole('button', { name: 'Update' }).click();

  await expect(page.getByText(/build e2e-new-version/)).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveCount(0);

  // Put the normal build back for the other tests.
  execSync('npm run build -w client', { stdio: 'ignore' });
});
