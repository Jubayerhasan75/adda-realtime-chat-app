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

/** A signed-in person in their own browser context. */
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

/** The status label (sr-only text) of my most recent bubble. */
const lastTick = (page) =>
  page.getByRole('log', { name: 'Messages' }).locator('span[title]').last();

test('journeys 5–6: start a chat, send, live delivery, unread badge, delivered → seen, typing', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia', 'Nadia');
  const arif = await person(browser, 'arif', 'Arif');
  const errors = [nadia.page, arif.page].map(trackConsoleErrors);
  const request = await nadia.api.post('/api/friends/requests', { userId: arif.userId });
  await arif.api.post(`/api/friends/requests/${request.id}/accept`);

  // Arif keeps the app open on another screen.
  await arif.page.goto('/settings');

  // Nadia starts the conversation from her friends list.
  await nadia.page.goto('/friends');
  await nadia.page.getByRole('button', { name: 'Message Arif' }).click();
  await expect(nadia.page.getByRole('heading', { name: 'Arif' })).toBeVisible();
  await nadia.page.getByLabel('Message', { exact: true }).fill('Hi Arif! 👋');
  await nadia.page.getByRole('button', { name: 'Send message' }).click();
  await expect(nadia.page.getByRole('log').getByText('Hi Arif! 👋')).toBeVisible();

  // Arif's app received it (delivered) even though he hasn't opened the chat.
  await expect(lastTick(nadia.page)).toHaveAttribute('title', 'Delivered');
  await expect(
    arif.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Chats/ }),
  ).toContainText('1 new');

  // Arif opens the chat: Nadia's tick turns to "Seen".
  await arif.page.getByRole('link', { name: /Chats/ }).first().click();
  await arif.page.getByRole('link', { name: /Nadia/ }).click();
  await expect(arif.page.getByRole('log').getByText('Hi Arif! 👋')).toBeVisible();
  await expect(lastTick(nadia.page)).toHaveAttribute('title', 'Seen');

  // Typing indicator, then a live reply.
  await arif.page.getByLabel('Message', { exact: true }).pressSequentially('Hey Nadia');
  await expect(
    nadia.page.getByRole('region', { name: 'Chat with Arif' }).getByText('typing…'),
  ).toBeVisible();
  await arif.page.getByRole('button', { name: 'Send message' }).click();
  await expect(nadia.page.getByRole('log').getByText('Hey Nadia')).toBeVisible();
  await expect(
    nadia.page.getByRole('region', { name: 'Chat with Arif' }).getByText('typing…'),
  ).toBeHidden();

  // Survives a refresh: history comes back from the server.
  await nadia.page.reload();
  await expect(nadia.page.getByRole('log').getByText('Hi Arif! 👋')).toBeVisible();
  await expect(nadia.page.getByRole('log').getByText('Hey Nadia')).toBeVisible();

  expect(errors.flat()).toEqual([]);
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('a message written while offline is sent automatically when back online', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_off', 'Nadia');
  const arif = await person(browser, 'arif_off', 'Arif');
  const conversationId = await befriendAndOpenChat(nadia, arif);
  await sendText(arif, conversationId, 'ping');

  await nadia.page.goto(`/chats/${conversationId}`);
  await expect(nadia.page.getByRole('log').getByText('ping')).toBeVisible();

  await nadia.context.setOffline(true);
  await nadia.page.getByLabel('Message', { exact: true }).fill('sent from a tunnel');
  await nadia.page.getByRole('button', { name: 'Send message' }).click();
  await expect(lastTick(nadia.page)).toHaveAttribute('title', 'Sending');

  await nadia.context.setOffline(false);
  await expect(lastTick(nadia.page)).toHaveAttribute('title', /Sent|Delivered|Seen/, {
    timeout: 20_000,
  });

  // Stored exactly once on the server.
  await arif.page.goto(`/chats/${conversationId}`);
  await expect(arif.page.getByRole('log').getByText('sent from a tunnel')).toHaveCount(1);
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('after unfriending, history stays readable but the composer is replaced', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_unf', 'Nadia');
  const arif = await person(browser, 'arif_unf', 'Arif');
  const conversationId = await befriendAndOpenChat(nadia, arif);
  await sendText(arif, conversationId, 'old message');

  await nadia.page.goto(`/chats/${conversationId}`);
  await expect(nadia.page.getByLabel('Message', { exact: true })).toBeVisible();

  const res = await arif.page.request.delete(`/api/friends/${nadia.userId}`, {
    headers: { Origin: 'http://localhost:4100', 'X-CSRF-Token': arif.csrfToken },
  });
  expect(res.status()).toBe(204);

  // The live friendship update reaches Nadia's open chat.
  await expect(nadia.page.getByText('You can’t send messages in this chat.')).toBeVisible();
  await expect(nadia.page.getByRole('log').getByText('old message')).toBeVisible();
  await Promise.all([nadia.context.close(), arif.context.close()]);
});
