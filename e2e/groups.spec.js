import { expect, test } from './fixtures.js';
import { createVerifiedAccount, openApp, trackConsoleErrors, uniqueName } from './helpers.js';

// docs/GROUPS.md — real browsers, real end-to-end encryption.

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

async function befriend(a, b) {
  const request = await a.api.post('/api/friends/requests', { userId: b.userId });
  await b.api.post(`/api/friends/requests/${request.id}/accept`);
}

const log = (page) => page.getByRole('log', { name: 'Messages' });

async function say(page, text) {
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(log(page).getByText(text)).toBeVisible();
}

test('groups: create, chat together, add someone who reads the history, remove someone', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const nadia = await person(browser, 'nadia_g', 'Nadia');
  const arif = await person(browser, 'arif_g', 'Arif');
  const sadia = await person(browser, 'sadia_g', 'Sadia');
  const rafi = await person(browser, 'rafi_g', 'Rafi');
  const errors = [nadia, arif, sadia, rafi].map(({ page }) => trackConsoleErrors(page));
  for (const friend of [arif, sadia, rafi]) await befriend(nadia, friend);

  // Nadia creates "Study group" with Arif and Sadia.
  await nadia.page.goto('/chats');
  await nadia.page.getByRole('link', { name: 'New group' }).click();
  await nadia.page.getByLabel('Group name').fill('Study group');
  const create = nadia.page.getByRole('button', { name: /Choose 2 more friends/ });
  await expect(create).toBeDisabled();
  await nadia.page.getByRole('checkbox', { name: /Arif/ }).click();
  await nadia.page.getByRole('checkbox', { name: /Sadia/ }).click();
  await nadia.page.getByRole('button', { name: 'Create group (3 people)' }).click();
  await expect(nadia.page.getByRole('heading', { name: 'Study group' })).toBeVisible();
  await expect(log(nadia.page).getByText('You created the group “Study group”')).toBeVisible();
  await say(nadia.page, 'Exam moved to Sunday');

  // Arif sees the group in his list and reads it; his reply reaches everyone.
  await arif.page.goto('/chats');
  await arif.page.getByRole('link', { name: /Study group/ }).click();
  await expect(log(arif.page).getByText('Exam moved to Sunday')).toBeVisible();
  await expect(log(arif.page).getByText('Nadia', { exact: true })).toBeVisible(); // sender name
  await say(arif.page, 'Thanks for telling us');
  await expect(log(nadia.page).getByText('Thanks for telling us')).toBeVisible();
  await sadia.page.goto('/chats');
  await sadia.page.getByRole('link', { name: /Study group/ }).click();
  await expect(log(sadia.page).getByText('Thanks for telling us')).toBeVisible();

  // Nadia (admin) adds Rafi: he can read the messages from before he joined.
  await nadia.page.getByRole('button', { name: 'Group info' }).click();
  const info = nadia.page.getByRole('dialog', { name: 'Group info' });
  await info.getByRole('button', { name: 'Add people' }).click();
  await info.getByRole('checkbox', { name: /Rafi/ }).click();
  await info.getByRole('button', { name: /Add 1 to group/ }).click();
  await expect(
    info.getByRole('list', { name: 'Members' }).getByText('Rafi', { exact: true }),
  ).toBeVisible();
  await rafi.page.goto('/chats');
  await rafi.page.getByRole('link', { name: /Study group/ }).click();
  await expect(log(rafi.page).getByText('Exam moved to Sunday')).toBeVisible();
  await expect(log(rafi.page).getByText('Nadia added you')).toBeVisible();

  // Nadia removes Sadia: the group disappears for her, and the others keep chatting with a
  // new group key that Sadia never gets.
  await info.getByRole('button', { name: /Sadia/ }).click();
  await info.getByRole('button', { name: 'Remove from group' }).click();
  await info.getByRole('button', { name: /Tap again to remove Sadia/ }).click();
  await expect(
    info.getByRole('list', { name: 'Members' }).getByText('Sadia', { exact: true }),
  ).toHaveCount(0);
  await info.getByRole('button', { name: 'Close' }).click();
  // Sadia had the group open: it closes, with a short notice, and leaves her list.
  await expect(sadia.page.getByText('You’re no longer in this group')).toBeVisible();
  await expect(sadia.page).toHaveURL('/chats');
  await expect(sadia.page.getByRole('link', { name: /Study group/ })).toHaveCount(0);

  await say(arif.page, 'See you on Sunday');
  await expect(log(nadia.page).getByText('See you on Sunday')).toBeVisible();
  await expect(log(rafi.page).getByText('See you on Sunday')).toBeVisible();

  // Sadia's app may have been refreshing the chat at the moment she was removed: the server
  // then correctly answers "not found", which the browser logs. Nothing else may fail.
  const [nadiaErrors, arifErrors, sadiaErrors, rafiErrors] = errors;
  expect([...nadiaErrors, ...arifErrors, ...rafiErrors]).toEqual([]);
  expect(sadiaErrors.filter((error) => !error.includes('status of 404'))).toEqual([]);
  await Promise.all([nadia, arif, sadia, rafi].map(({ context }) => context.close()));
});
