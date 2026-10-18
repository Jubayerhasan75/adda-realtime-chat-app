import { expect, test } from './fixtures.js';
import { trackConsoleErrors } from './helpers.js';

test('status page reaches the API and database with no console or CSP errors', async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto('/status');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page).toHaveTitle('Adda');
  await expect(page.getByText('API: ok')).toBeVisible();
  await expect(page.getByText('Database: up')).toBeVisible();
  expect(errors).toEqual([]);
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
