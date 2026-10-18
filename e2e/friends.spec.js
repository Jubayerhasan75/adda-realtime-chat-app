import { expect, test } from './fixtures.js';
import { autoUnlock, createVerifiedAccount, trackConsoleErrors, uniqueName } from './helpers.js';

// Two separate people, each in their own browser context (own cookies, own live connection).
test.use({ storageState: { cookies: [], origins: [] } });

async function openAs(browser, username, displayName) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await autoUnlock(page);
  const account = await createVerifiedAccount(page.request, {
    username: uniqueName(username),
    displayName,
  });
  return { context, page, username: account.username };
}

test('journeys 3–4: find someone, send a request, accept it live, then block', async ({
  browser,
}) => {
  const nadia = await openAs(browser, 'nadia_e2e', 'Nadia E2E');
  const arif = await openAs(browser, 'arif_e2e', 'Arif E2E');
  const errors = [...[nadia.page, arif.page].map(trackConsoleErrors)];

  await arif.page.goto('/friends');
  await expect(arif.page.getByText('No friends yet')).toBeVisible();

  // Nadia searches by partial username and sends a request.
  await nadia.page.goto('/friends');
  await nadia.page.getByLabel('Search people by username').fill(arif.username.slice(0, -2)); // partial username;
  const results = nadia.page.getByRole('list', { name: 'Search results' });
  await expect(results.getByText('Arif E2E')).toBeVisible();
  await results.getByRole('button', { name: 'Add' }).click();
  await expect(results.getByRole('button', { name: /Cancel friend request/ })).toBeVisible();

  // Arif sees the request appear without reloading (live update) and the badge on the tab.
  await expect(arif.page.getByText('Friend requests')).toBeVisible();
  await expect(arif.page.getByText('sent you a friend request')).toBeVisible();
  await arif.page.getByRole('button', { name: 'Accept' }).click();
  await expect(
    arif.page.getByRole('list', { name: 'Friends' }).getByText('Nadia E2E'),
  ).toBeVisible();

  // Nadia's friends list updates live too.
  await nadia.page.getByLabel('Search people by username').fill('');
  await expect(
    nadia.page.getByRole('list', { name: 'Friends' }).getByText('Arif E2E'),
  ).toBeVisible();
  await expect(nadia.page.getByText('accepted your friend request')).toBeVisible();

  // Nadia blocks Arif from his profile: he disappears from both lists.
  await nadia.page.getByRole('list', { name: 'Friends' }).getByText('Arif E2E').click();
  const profile = nadia.page.getByRole('dialog', { name: 'Profile' });
  await profile.getByRole('button', { name: 'Block' }).click();
  await profile.getByRole('button', { name: 'Tap again to block' }).click();
  await expect(profile.getByText('You blocked this person.')).toBeVisible();
  await profile.getByRole('button', { name: 'Close' }).click();

  await expect(arif.page.getByText('No friends yet')).toBeVisible();
  await arif.page.getByLabel('Search people by username').fill(nadia.username);
  await expect(arif.page.getByText('No one found')).toBeVisible();

  expect(errors.flat()).toEqual([]);
  await Promise.all([nadia.context.close(), arif.context.close()]);
});

test('reporting a user from their profile', async ({ browser }) => {
  const reporter = await openAs(browser, 'reporter_e2e', 'Reporter');
  const spammer = await openAs(browser, 'spammer_e2e', 'Spammer');

  await reporter.page.goto('/friends');
  await reporter.page.getByLabel('Search people by username').fill(spammer.username);
  await reporter.page
    .getByRole('list', { name: 'Search results' })
    .getByText('Spammer', { exact: true })
    .click();
  const profile = reporter.page.getByRole('dialog', { name: 'Profile' });
  await profile.getByRole('button', { name: 'Report' }).click();
  await profile.getByRole('button', { name: 'Send report' }).click();
  await expect(profile.getByText('Choose a reason')).toHaveCount(2); // placeholder + error
  await profile.getByLabel(/Why are you reporting/).selectOption('spam');
  await profile.getByRole('button', { name: 'Send report' }).click();
  await expect(profile.getByText('Thanks. We received your report.')).toBeVisible();
  await reporter.context.close();
});
