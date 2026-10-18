import { expect, test } from './fixtures.js';
import {
  openApp,
  befriendAndOpenChat,
  createVerifiedAccount,
  sendText,
  trackConsoleErrors,
  uniqueName,
} from './helpers.js';

test.use({ storageState: { cookies: [], origins: [] } });

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

const log = (page) => page.getByRole('log', { name: 'Messages' });
const bubble = (page, text) => log(page).locator('[id^="message-"]', { hasText: text });
const lastTick = (page) => log(page).locator('span[title]').last();

/** Opens a message's action menu the way a desktop user would (right-click). */
async function openMenu(page, text) {
  // .first(): the original, not a later reply that quotes the same words.
  await bubble(page, text).first().getByText(text).first().click({ button: 'right' });
  return page.getByRole('dialog', { name: 'Message' });
}

test('journey 8: react, reply, edit, pin, search and unsend — live for both people', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_f', 'Nadia');
  const arif = await person(browser, 'arif_f', 'Arif');
  const errors = [nadia.page, arif.page].map(trackConsoleErrors);
  const chat = await befriendAndOpenChat(nadia, arif);
  await sendText(nadia, chat, 'Lets meet at the libary at 10');
  await sendText(nadia, chat, 'Bring the lab sheet');

  await Promise.all([nadia.page.goto(`/chats/${chat}`), arif.page.goto(`/chats/${chat}`)]);

  // Arif reacts with ❤️ — Nadia sees the reaction appear.
  let menu = await openMenu(arif.page, 'Bring the lab sheet');
  await menu.getByRole('button', { name: 'React ❤️' }).click();
  await expect(
    bubble(nadia.page, 'Bring the lab sheet').getByRole('button', { name: /❤️ 1/ }),
  ).toBeVisible();

  // Arif replies to the first message; the quote is shown to both.
  menu = await openMenu(arif.page, 'Lets meet');
  await menu.getByRole('button', { name: 'Reply' }).click();
  await expect(arif.page.getByText('Replying to Nadia')).toBeVisible();
  await arif.page.getByLabel('Message', { exact: true }).fill('Sure, see you there');
  await arif.page.getByRole('button', { name: 'Send message' }).click();
  const reply = bubble(nadia.page, 'Sure, see you there');
  await expect(reply.getByText('Lets meet at the libary at 10')).toBeVisible();

  // Nadia fixes her typo; Arif sees the edited text live.
  menu = await openMenu(nadia.page, 'Lets meet');
  await menu.getByRole('button', { name: 'Edit' }).click();
  const input = nadia.page.getByLabel('Message', { exact: true });
  await input.fill('Lets meet at the library at 10');
  await nadia.page.getByRole('button', { name: 'Save edit' }).click();
  await expect(bubble(arif.page, 'library at 10').getByText('edited')).toBeVisible();

  // Pin it: the pinned bar appears for both.
  menu = await openMenu(nadia.page, 'library at 10');
  await menu.getByRole('button', { name: 'Pin' }).click();
  await expect(arif.page.getByRole('button', { name: /Pinned message/ })).toBeVisible();

  // Search inside the chat finds the corrected word and highlights it.
  await arif.page.getByRole('button', { name: 'Chat options' }).click();
  await arif.page.getByRole('button', { name: 'Search in this chat' }).click();
  await arif.page.getByLabel('Search in this chat').fill('library');
  await expect(arif.page.getByRole('status').filter({ hasText: '1 of 1' })).toBeVisible();
  await expect(log(arif.page).locator('mark', { hasText: 'library' }).first()).toBeVisible();
  await arif.page.getByRole('button', { name: 'Close search' }).click();

  // Nadia unsends the lab-sheet message: gone for both, placeholder remains.
  menu = await openMenu(nadia.page, 'Bring the lab sheet');
  await menu.getByRole('button', { name: 'Unsend for everyone' }).click();
  await menu.getByRole('button', { name: 'Tap again to unsend for everyone' }).click();
  await expect(log(arif.page).getByText('This message was unsent')).toBeVisible();
  await expect(log(arif.page).getByText('Bring the lab sheet')).toHaveCount(0);

  expect(errors.flat()).toEqual([]);
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('journey 9: the long-press preview does not mark messages as seen', async ({ browser }) => {
  const nadia = await person(browser, 'nadia_p', 'Nadia');
  const arif = await person(browser, 'arif_p', 'Arif');
  const chat = await befriendAndOpenChat(nadia, arif);

  // Nadia sends while Arif's app is open on the chat list (so it is "delivered").
  await arif.page.goto('/chats');
  await nadia.page.goto(`/chats/${chat}`);
  await nadia.page.getByLabel('Message', { exact: true }).fill('Did you see the result?');
  await nadia.page.getByRole('button', { name: 'Send message' }).click();
  await expect(lastTick(nadia.page)).toHaveAttribute('title', 'Delivered');

  // Arif peeks with a long press / right-click instead of opening the chat.
  await arif.page.getByRole('link', { name: /Nadia/ }).click({ button: 'right' });
  const preview = arif.page.getByRole('dialog', { name: 'Nadia' });
  await expect(preview.getByText('Did you see the result?')).toBeVisible();
  await expect(arif.page).toHaveURL('/chats');

  // Still "Delivered" for Nadia, still unread for Arif.
  await nadia.page.waitForTimeout(1500);
  await expect(lastTick(nadia.page)).toHaveAttribute('title', 'Delivered');
  await preview.getByRole('button', { name: 'Close' }).first().click();
  await expect(arif.page.getByRole('link', { name: /Nadia/ })).toContainText('1');

  // Opening the chat normally applies the read rules.
  await arif.page.getByRole('link', { name: /Nadia/ }).click();
  await expect(lastTick(nadia.page)).toHaveAttribute('title', 'Seen');
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('delete for me hides a message only for me; clear chat empties only my view', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_d', 'Nadia');
  const arif = await person(browser, 'arif_d', 'Arif');
  const chat = await befriendAndOpenChat(nadia, arif);
  await sendText(arif, chat, 'first');
  await sendText(arif, chat, 'second');

  await nadia.page.goto(`/chats/${chat}`);
  const menu = await openMenu(nadia.page, 'first');
  await menu.getByRole('button', { name: 'Delete for me' }).click();
  await expect(log(nadia.page).getByText('first')).toHaveCount(0);

  await nadia.page.getByRole('button', { name: 'Chat options' }).click();
  await nadia.page.getByRole('button', { name: 'Clear chat history' }).click();
  await nadia.page.getByRole('button', { name: /Tap again to clear/ }).click();
  await expect(log(nadia.page).getByText('second')).toHaveCount(0);

  await arif.page.goto(`/chats/${chat}`);
  await expect(log(arif.page).getByText('first')).toBeVisible();
  await expect(log(arif.page).getByText('second')).toBeVisible();
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('scrolled up: new messages show a ↓ button with a count that jumps to the newest', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_j', 'Nadia');
  const arif = await person(browser, 'arif_j', 'Arif');
  const chat = await befriendAndOpenChat(nadia, arif);
  for (let i = 1; i <= 25; i += 1) await sendText(nadia, chat, `Message number ${i}`);
  await arif.page.goto(`/chats/${chat}`);
  await expect(log(arif.page).getByText('Message number 25')).toBeVisible();

  // At the bottom there's no button; reading older messages shows it.
  const jump = arif.page.getByRole('button', { name: /Scroll to the newest/ });
  await expect(jump).toHaveCount(0);
  await log(arif.page).evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(jump).toBeVisible();

  await sendText(nadia, chat, 'Are you there?');
  await sendText(nadia, chat, 'Hello?');
  await expect(
    arif.page.getByRole('button', { name: '2 new messages. Scroll to the newest' }),
  ).toBeVisible();

  await jump.click();
  await expect(log(arif.page).getByText('Hello?')).toBeInViewport();
  await expect(jump).toHaveCount(0);
  await Promise.all([nadia.context.close(), arif.context.close()]);
});
