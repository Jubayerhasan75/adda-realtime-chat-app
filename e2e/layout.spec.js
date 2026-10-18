import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures.js';
import {
  SHARED_CHAT,
  createVerifiedAccount,
  horizontalOverflow,
  trackConsoleErrors,
  uniqueName,
} from './helpers.js';

/** The conversation created by auth.setup.js for the shared signed-in account. */
const sharedChat = () => JSON.parse(readFileSync(SHARED_CHAT, 'utf8'));

const VIEWPORTS = {
  'small Android (360×640)': { width: 360, height: 640 },
  'iPhone (390×844)': { width: 390, height: 844 },
  'tablet (768×1024)': { width: 768, height: 1024 },
  'desktop (1440×900)': { width: 1440, height: 900 },
};

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(name, () => {
    test.use({ viewport });

    for (const theme of ['light', 'dark']) {
      test(`${theme}: list and chat fit the screen without errors`, async ({ page }, testInfo) => {
        const errors = trackConsoleErrors(page);
        // The account's theme is "system", so the emulated OS setting decides light/dark.
        await page.emulateMedia({ colorScheme: theme });

        await page.goto('/chats');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await horizontalOverflow(page)).toBe(0);

        await page.goto(`/chats/${sharedChat().conversationId}`);
        await expect(page.getByText('Are you coming to the match on Friday?')).toBeVisible();
        await expect(page.getByRole('log', { name: 'Messages' })).toBeVisible();
        await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
        expect(await horizontalOverflow(page)).toBe(0);

        await page.screenshot({ path: testInfo.outputPath(`chat-${theme}.png`) });
        expect(errors).toEqual([]);
      });
    }
  });
}

test.describe('phone navigation', () => {
  test.use({ viewport: VIEWPORTS['iPhone (390×844)'] });

  test('list → chat → back, with bottom navigation hidden inside a chat', async ({ page }) => {
    await page.goto('/chats');
    const mainNav = page.getByRole('navigation', { name: 'Main' });
    await expect(mainNav).toBeVisible();

    await page.getByRole('link', { name: /Arif Hossain/ }).click();
    await expect(page).toHaveURL(`/chats/${sharedChat().conversationId}`);
    await expect(page.getByRole('navigation', { name: 'Conversations' })).toBeHidden();
    await expect(mainNav).toBeHidden();

    await page.getByRole('link', { name: 'Back to chats' }).click();
    await expect(page).toHaveURL('/chats');
    await expect(mainNav).toBeVisible();
  });

  test('the composer stays inside the viewport', async ({ page }) => {
    await page.goto(`/chats/${sharedChat().conversationId}`);
    const box = await page.getByRole('button', { name: 'Send message' }).boundingBox();

    expect(box.y + box.height).toBeLessThanOrEqual(844);
  });
});

test.describe('desktop layout', () => {
  test.use({ viewport: VIEWPORTS['desktop (1440×900)'] });

  test('shows list and chat side by side, with chat options available', async ({ page }) => {
    await page.goto('/chats');
    await expect(page.getByText('Select a conversation')).toBeVisible();

    await page.getByRole('link', { name: /Arif Hossain/ }).click();
    await expect(page.getByRole('navigation', { name: 'Conversations' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Arif Hossain' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to chats' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Chat options' }).click();
    const options = page.getByRole('dialog', { name: 'Chat options' });
    await expect(options.getByText('Chat color')).toBeVisible();
    await options.getByRole('button', { name: 'Close' }).click();
    await expect(options).toBeHidden();
  });
});

test('theme choice applies immediately and survives a reload without a flash', async ({ page }) => {
  // Its own account: changing the theme is saved to the account and must not affect other tests.
  await page.context().clearCookies();
  await createVerifiedAccount(page.request, { username: uniqueName('themer') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings/appearance');
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // theme-init.js must set the theme before React renders; check the very first paint.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => document.body !== null);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
});
