import { expect, test } from './fixtures.js';
import { befriendAndOpenChat, openApp, createVerifiedAccount, uniqueName } from './helpers.js';

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

test('journey 10 (presence): online, then "last seen", and privacy hides both ways', async ({
  browser,
}) => {
  const nadia = await person(browser, 'nadia_o', 'Nadia');
  const arif = await person(browser, 'arif_o', 'Arif');
  const chat = await befriendAndOpenChat(nadia, arif);

  await arif.page.goto(`/chats/${chat}`);
  const status = arif.page
    .getByRole('heading', { name: 'Nadia' })
    .locator('xpath=following-sibling::p');
  // Nadia has the app open: Arif sees "online" and a green dot.
  await expect(status).toHaveText('online');
  await expect(arif.page.locator('header').getByText('Online', { exact: true })).toBeAttached();

  // Nadia closes the app: shortly after, Arif sees when she was last online.
  await nadia.page.close();
  await expect(status).toHaveText(/^last seen today at /);

  // Nadia comes back and hides her online status: Arif sees nothing at all.
  nadia.page = await nadia.context.newPage();
  await nadia.page.goto('/chats');
  await expect(status).toHaveText('online');
  await nadia.page.goto('/settings/privacy');
  await nadia.page.getByRole('switch', { name: /Show when I’m online/ }).click();
  await expect(nadia.page.getByRole('switch', { name: /Show when I’m online/ })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(status).toHaveText('');

  // Reciprocity: with hers hidden, Nadia can't see Arif's online status either.
  await nadia.page.goto(`/chats/${chat}`);
  const nadiaSees = nadia.page
    .getByRole('heading', { name: 'Arif' })
    .locator('xpath=following-sibling::p');
  await expect(nadiaSees).toHaveText('');
  await Promise.all([nadia.context.close(), arif.context.close()]);
});
