import { expect, test } from './fixtures.js';
import {
  openApp,
  befriendAndOpenChat,
  createVerifiedAccount,
  horizontalOverflow,
  trackConsoleErrors,
  uniqueName,
} from './helpers.js';

test.use({ storageState: { cookies: [], origins: [] } });

// Real image bytes (an 8×8 PNG and a 1×1 GIF) and a text file pretending to be a photo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
);
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const png = (name) => ({ name, mimeType: 'image/png', buffer: PNG });

async function person(browser, name, displayName, { phone = false } = {}) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    // A touch phone (coarse pointer), like a real Android device.
    ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {}),
  });
  const page = await context.newPage();
  const account = await createVerifiedAccount(page.request, {
    username: uniqueName(name),
    displayName,
  });
  await openApp(page);
  return { context, page, ...account };
}

const log = (page) => page.getByRole('log', { name: 'Messages' });

/** KLIPY is answered by the test itself: no real requests and no real API key. */
async function fakeKlipy(context) {
  await context.route('https://api.klipy.com/**', (route) =>
    route.fulfill({
      json: {
        result: true,
        data: {
          has_next: false,
          current_page: 1,
          data: [
            {
              id: 1,
              slug: 'hello-wave-1',
              title: 'Hello wave',
              file: {
                md: {
                  webp: { url: 'https://static.klipy.com/ii/e2e/md.gif', width: 200, height: 150 },
                },
                sm: {
                  webp: { url: 'https://static.klipy.com/ii/e2e/sm.gif', width: 100, height: 75 },
                },
              },
            },
          ],
        },
      },
    }),
  );
  await context.route('https://static.klipy.com/**', (route) =>
    route.fulfill({ body: GIF, contentType: 'image/gif' }),
  );
}

test('journey 7: send photos with a caption, view them full screen, unsend removes them', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_m', 'Nadia');
  const arif = await person(browser, 'arif_m', 'Arif');
  const errors = [nadia.page, arif.page].map(trackConsoleErrors);
  const chat = await befriendAndOpenChat(nadia, arif);
  await Promise.all([nadia.page.goto(`/chats/${chat}`), arif.page.goto(`/chats/${chat}`)]);

  // Nadia picks two photos: they upload straight away and Send waits for them.
  await nadia.page.getByTestId('attach-input').setInputFiles([png('one.png'), png('two.png')]);
  const tray = nadia.page.getByRole('list', { name: 'Files to send' });
  await expect(tray.getByRole('listitem')).toHaveCount(2);
  await nadia.page.getByLabel('Message', { exact: true }).fill('From the trip');
  const send = nadia.page.getByRole('button', { name: 'Send message' });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(tray).toHaveCount(0);

  // Arif receives both photos and the caption live, loaded through the protected media URL.
  const received = log(arif.page).locator('[id^="message-"]', { hasText: 'From the trip' });
  await expect(received.getByRole('button', { name: /Photo \d of 2/ })).toHaveCount(2);
  const firstImage = received.locator('img').first();
  await expect(firstImage).toHaveAttribute('src', /^\/api\/media\/[a-f0-9]{24}\?variant=thumb$/);
  await expect.poll(() => firstImage.evaluate((img) => img.complete && img.naturalWidth)).toBe(8);

  // Full-screen viewer; the browser's back button closes it and stays in the chat.
  await received.getByRole('button', { name: 'Photo 1 of 2. Open' }).click();
  const viewer = arif.page.getByRole('dialog', { name: 'Photo' });
  await expect(viewer.getByText('1 / 2')).toBeVisible();
  await viewer.getByRole('button', { name: 'Next' }).click();
  await expect(viewer.getByText('2 / 2')).toBeVisible();
  await arif.page.goBack();
  await expect(viewer).toBeHidden();
  await expect(arif.page).toHaveURL(`/chats/${chat}`);

  // Someone outside the chat can't load the photo, even with its address.
  const src = await firstImage.getAttribute('src');
  const stranger = await person(browser, 'sadia_m', 'Sadia');
  expect((await stranger.page.request.get(src, { maxRedirects: 0 })).status()).toBe(404);

  // Nadia unsends: the photos disappear for Arif and the file is gone from the server.
  const mine = log(nadia.page).locator('[id^="message-"]', { hasText: 'From the trip' });
  await mine.getByText('From the trip').click({ button: 'right' });
  const menu = nadia.page.getByRole('dialog', { name: 'Message' });
  await menu.getByRole('button', { name: 'Unsend for everyone' }).click();
  await menu.getByRole('button', { name: 'Tap again to unsend for everyone' }).click();
  await expect(log(arif.page).getByText('This message was unsent')).toBeVisible();
  await expect(log(arif.page).locator('img')).toHaveCount(0);
  expect((await arif.page.request.get(src, { maxRedirects: 0 })).status()).toBe(404);

  expect(errors.flat()).toEqual([]);
  await Promise.all([nadia.context.close(), arif.context.close(), stranger.context.close()]);
});

test('a file disguised as a photo is refused and can be removed', async ({ browser }) => {
  const nadia = await person(browser, 'nadia_x', 'Nadia');
  const arif = await person(browser, 'arif_x', 'Arif');
  const chat = await befriendAndOpenChat(nadia, arif);
  await nadia.page.goto(`/chats/${chat}`);

  await nadia.page.getByTestId('attach-input').setInputFiles({
    name: 'holiday.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('#!/bin/sh\necho "not a photo"\n'),
  });
  const tray = nadia.page.getByRole('list', { name: 'Files to send' });
  await expect(tray.getByRole('button', { name: /Retry uploading holiday\.jpg/ })).toBeVisible();
  await nadia.page.getByLabel('Message', { exact: true }).fill('look');
  await expect(nadia.page.getByRole('button', { name: 'Send message' })).toBeDisabled();

  await tray.getByRole('button', { name: 'Remove holiday.jpg' }).click();
  await expect(tray).toHaveCount(0);
  await expect(nadia.page.getByRole('button', { name: 'Send message' })).toBeEnabled();
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('send a GIF from the picker (KLIPY attribution shown)', async ({ browser }) => {
  const nadia = await person(browser, 'nadia_g', 'Nadia');
  const arif = await person(browser, 'arif_g', 'Arif');
  await fakeKlipy(nadia.context);
  await fakeKlipy(arif.context);
  const chat = await befriendAndOpenChat(nadia, arif);
  await Promise.all([nadia.page.goto(`/chats/${chat}`), arif.page.goto(`/chats/${chat}`)]);

  await nadia.page.getByRole('button', { name: 'Emoji and GIFs' }).click();
  const panel = nadia.page.getByRole('region', { name: 'Emoji and GIFs' });
  await panel.getByRole('tab', { name: 'GIF' }).click();
  await expect(panel.getByPlaceholder('Search KLIPY')).toBeVisible();
  await expect(panel.getByText('Powered by KLIPY')).toBeVisible();
  await panel.getByRole('img', { name: 'Hello wave' }).click();
  await expect(panel).toBeHidden();

  await expect(log(arif.page).getByRole('img', { name: 'GIF: Hello wave' })).toBeVisible();
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('on a phone, the emoji panel replaces the keyboard and keeps the typing box visible', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_e', 'Nadia', { phone: true });
  const arif = await person(browser, 'arif_e', 'Arif');
  const chat = await befriendAndOpenChat(nadia, arif);
  await nadia.page.goto(`/chats/${chat}`);
  const input = nadia.page.getByLabel('Message', { exact: true });
  await input.fill('hi');

  await nadia.page.getByRole('button', { name: 'Emoji and GIFs' }).click();
  const panel = nadia.page.getByRole('region', { name: 'Emoji and GIFs' });
  await expect(panel).toBeVisible();
  // The cursor stays in the typing box, but the phone keyboard is asked to stay hidden.
  await expect(input).toHaveAttribute('inputmode', 'none');
  await expect(input).toBeFocused();

  const emojis = panel.getByRole('tabpanel').getByRole('button');
  await emojis.nth(0).tap();
  await emojis.nth(1).tap();
  await emojis.nth(0).tap();
  const [first, second] = [await emojis.nth(0).textContent(), await emojis.nth(1).textContent()];
  await expect(input).toHaveValue(`hi${first}${second}${first}`);

  // The typing box sits right above the panel, fully on screen.
  const [box, panelBox] = [await input.boundingBox(), await panel.boundingBox()];
  expect(box.y + box.height).toBeLessThanOrEqual(panelBox.y);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(844 + 1);

  await nadia.page.goBack();
  await expect(panel).toBeHidden();
  await expect(nadia.page).toHaveURL(`/chats/${chat}`);
  await expect(input).not.toHaveAttribute('inputmode', 'none');
  expect(await horizontalOverflow(nadia.page)).toBe(0);

  // Sending a message keeps the panel open (like WhatsApp), and a tap on the messages closes it.
  await nadia.page.getByRole('button', { name: 'Emoji and GIFs' }).click();
  await nadia.page.getByRole('button', { name: 'Send message' }).tap();
  await expect(panel).toBeVisible();
  await log(nadia.page).tap({ position: { x: 20, y: 20 } });
  await expect(panel).toBeHidden();
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('a profile photo shows up for friends', async ({ browser }) => {
  const nadia = await person(browser, 'nadia_a', 'Nadia');
  const arif = await person(browser, 'arif_a', 'Arif');
  await befriendAndOpenChat(nadia, arif);

  await nadia.page.goto('/settings/profile');
  await nadia.page.getByTestId('avatar-input').setInputFiles(png('me.png'));
  await expect(nadia.page.getByRole('button', { name: 'Remove photo' })).toBeVisible();

  await arif.page.goto('/friends?tab=friends');
  const photo = arif.page.locator('img[src^="/api/media/"][src*="variant=avatar"]').first();
  await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth)).toBe(8);
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('long-press preview shows photos; "Delete chat" removes it from my list only', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_v', 'Nadia');
  const arif = await person(browser, 'arif_v', 'Arif');
  const chat = await befriendAndOpenChat(nadia, arif);

  // A new account with a friend but no chats sees "Start a chat" instead of an empty list.
  await expect(arif.page.getByRole('heading', { name: 'Start a chat' })).toBeVisible();

  await nadia.page.goto(`/chats/${chat}`);
  await nadia.page.getByTestId('attach-input').setInputFiles([png('beach.png')]);
  await nadia.page.getByLabel('Message', { exact: true }).fill('Look at this');
  await expect(nadia.page.getByRole('button', { name: 'Send message' })).toBeEnabled();
  await nadia.page.getByRole('button', { name: 'Send message' }).click();

  await arif.page.goto('/chats');
  await arif.page.getByRole('link', { name: /Nadia/ }).click({ button: 'right' });
  const preview = arif.page.getByRole('dialog', { name: 'Nadia' });
  await expect(preview.locator('img[src^="/api/media/"]')).toBeVisible();
  await expect(preview.getByText(/Look at this/)).toBeVisible();

  await preview.getByRole('button', { name: 'Delete chat' }).click();
  await preview.getByRole('button', { name: 'Tap again to delete this chat' }).click();
  await expect(arif.page.getByRole('link', { name: /Nadia/ })).toHaveCount(0);
  await arif.page.reload();
  await expect(arif.page.getByRole('link', { name: /Nadia/ })).toHaveCount(0);

  // Nadia still has the chat and her photo.
  await nadia.page.goto('/chats');
  await expect(nadia.page.getByRole('link', { name: /Arif/ })).toBeVisible();
  await Promise.all([nadia.context.close(), arif.context.close()]);
});
