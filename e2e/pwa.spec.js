import { expect, test } from './fixtures.js';

test('installable: manifest and icons are valid', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({
    name: 'Adda',
    short_name: 'Adda',
    display: 'standalone',
    start_url: '/',
    theme_color: '#592E83',
  });
  expect(manifest.icons.map((icon) => icon.purpose)).toEqual(['any', 'any', 'maskable']);
  for (const src of [...manifest.icons.map((icon) => icon.src), '/icons/apple-touch-icon.png']) {
    const icon = await request.get(src);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()['content-type']).toBe('image/png');
  }
});

test('the app opens offline from the stored app shell, and no private data is ever stored', async ({
  page,
  context,
}) => {
  await page.goto('/chats');
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('You’re offline')).toBeVisible();
  await context.setOffline(false);
  // Back online: the app continues by itself, no reload needed.
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();

  const stored = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(stored.length).toBeGreaterThan(5);
  expect(stored.filter((url) => /\/api\/|\/socket\.io\//.test(url))).toEqual([]);
});

test('losing the connection mid-chat shows it, and a message typed meanwhile is sent when back', async ({
  page,
  context,
}) => {
  const { readFileSync } = await import('node:fs');
  const { conversationId } = JSON.parse(readFileSync('e2e/.auth/shared-chat.json', 'utf8'));
  await page.goto(`/chats/${conversationId}`);
  await expect(page.getByRole('log', { name: 'Messages' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(/You’re offline — messages will send/)).toBeVisible();
  const text = `sent after reconnecting ${Date.now()}`;
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
  const bubble = page
    .getByRole('log', { name: 'Messages' })
    .locator('[id^="message-"]', { hasText: text });
  await expect(bubble.locator('span[title]').last()).toHaveAttribute('title', 'Sending');

  await context.setOffline(false);
  await expect(page.getByText(/You’re offline/)).toBeHidden({ timeout: 20_000 });
  await expect(bubble.locator('span[title]').last()).not.toHaveAttribute('title', 'Sending', {
    timeout: 20_000,
  });
});
