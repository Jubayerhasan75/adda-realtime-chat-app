import { expect, test } from './fixtures.js';
import {
  befriendAndOpenChat,
  createVerifiedAccount,
  openApp,
  sendText,
  trackConsoleErrors,
  uniqueName,
} from './helpers.js';

test.use({ storageState: { cookies: [], origins: [] } });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
);

async function person(browser, name, displayName) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const account = await createVerifiedAccount(page.request, {
    username: uniqueName(name),
    displayName,
  });
  await openApp(page);
  return { context, page, ...account };
}

test('chat color (preset or any color) recolors my bubbles; a background is kept on this device', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_t', 'Nadia');
  const arif = await person(browser, 'arif_t', 'Arif');
  const errors = trackConsoleErrors(nadia.page);
  const chat = await befriendAndOpenChat(nadia, arif);
  await sendText(nadia, chat, 'Color check');
  await nadia.page.goto(`/chats/${chat}`);

  const bubble = nadia.page
    .getByRole('log', { name: 'Messages' })
    .getByText('Color check')
    .locator('xpath=ancestor::div[contains(@class,"rounded-bubble")][1]');
  const background = () => bubble.evaluate((el) => getComputedStyle(el).backgroundColor);
  const options = nadia.page.getByRole('dialog', { name: 'Chat options' });
  const open = () => nadia.page.getByRole('button', { name: 'Chat options' }).click();

  await open();
  await options.getByText('Ocean', { exact: true }).click();
  await expect.poll(background).toBe('rgb(29, 90, 133)');

  await options.getByLabel('Custom color').fill('#ffd54f');
  await expect.poll(background).toBe('rgb(255, 213, 79)');
  // A light color gets dark text so it stays readable.
  expect(await bubble.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(20, 17, 26)');

  await options.getByRole('button', { name: 'Ocean background' }).click();
  await options.getByRole('radio', { name: 'strong' }).click();
  await options.getByRole('button', { name: 'Close' }).click();
  const wallpaper = nadia.page.locator('[style*="linear-gradient"]').first();
  await expect(wallpaper).toBeVisible();

  // After a reload: the color comes from my account, the background from this device.
  await nadia.page.reload();
  await expect.poll(background).toBe('rgb(255, 213, 79)');
  await expect(nadia.page.locator('[style*="linear-gradient"]').first()).toBeVisible();

  // My own photo as the background.
  await open();
  await options.getByTestId('wallpaper-input').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await options.getByRole('button', { name: 'Close' }).click();
  await expect(nadia.page.locator('[style*="url(\\"blob:"]').first()).toBeAttached();

  // Only I see it: Arif's view of the chat is unchanged.
  await arif.page.goto(`/chats/${chat}`);
  await expect(
    arif.page.getByRole('log', { name: 'Messages' }).getByText('Color check'),
  ).toBeVisible();
  expect(await arif.page.locator('[style*="url(\\"blob:"]').count()).toBe(0);

  expect(errors).toEqual([]);
  await Promise.all([nadia.context.close(), arif.context.close()]);
});
