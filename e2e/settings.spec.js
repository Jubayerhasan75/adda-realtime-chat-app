import { expect, test } from './fixtures.js';
import { PASSWORD, createVerifiedAccount, uniqueName } from './helpers.js';

test.use({ storageState: { cookies: [], origins: [] } });

test('Settings: grouped sections that open as pages; change password with a confirm field', async ({
  page,
}) => {
  const { username } = await createVerifiedAccount(page.request, {
    username: uniqueName('settler'),
    displayName: 'Settler',
  });
  await page.goto('/settings');

  // Grouped like Messenger, each row opens its own page.
  for (const group of ['Preferences', 'Account', 'About']) {
    await expect(page.getByRole('heading', { name: group })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: /Edit profile/ })).toContainText(`@${username}`);
  await page.getByRole('link', { name: /Privacy/ }).click();
  await expect(page).toHaveURL('/settings/privacy');
  await expect(page.getByRole('switch', { name: /Show when I’m online/ })).toBeVisible();
  await page.goBack(); // the phone's back gesture returns to the list
  await expect(page).toHaveURL('/settings');

  // Password page: passwords are never shown, and the two new ones must match.
  await page.getByRole('link', { name: /Password/ }).click();
  const fields = ['Current password', 'New password', 'Confirm new password'];
  for (const label of fields) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('type', 'password');
  }
  await expect(page.getByRole('button', { name: /Show password/ })).toHaveCount(0);
  const newPassword = 'blue-kettle-garden-81';
  await page.getByLabel('Current password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(`${newPassword}x`);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('The new passwords don’t match')).toBeVisible();

  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Password changed' })).toBeVisible();
  await expect(page).toHaveURL('/settings');

  // Still signed in on this device; the new password works for the next login.
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/chats');
});
