import { expect, test } from './fixtures.js';
import { trackConsoleErrors } from './helpers.js';

test('the app loads with its security headers, and the API and database are up', async ({
  page,
}) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto('/chats');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page).toHaveTitle('Adda');
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();

  const ready = await page.request.get('/api/health/ready');
  expect(ready.status()).toBe(200);
  expect(errors).toEqual([]);
});

test('developer pages are not part of the live app', async ({ page }) => {
  for (const path of ['/status', '/dev/mailbox']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  }
});

test('the root URL opens the chats section', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('/chats');
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
});

test('unknown routes render the not-found page', async ({ page }) => {
  await page.goto('/some/missing/page');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to the home page' }).click();
  await expect(page).toHaveURL('/chats');
});
