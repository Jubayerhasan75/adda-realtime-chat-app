import { expect, test } from './fixtures.js';
import {
  PASSWORD,
  createVerifiedAccount,
  uniqueName,
  lastEmail,
  linkFromEmail,
  trackConsoleErrors,
} from './helpers.js';

// These journeys start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test('journey 1–2: register, verify by email, log in, stay logged in after refresh', async ({
  page,
}) => {
  const errors = trackConsoleErrors(page);
  const journey = uniqueName('journey');

  await page.goto('/register');
  await page.getByLabel('Display name').fill('Journey User');
  await page.getByLabel('Username').fill(journey);
  await page.getByLabel('Email').fill(`${journey}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  // Signing in before verifying shows the verification notice instead of the app.
  await page.getByRole('link', { name: 'Continue to log in' }).click();
  await page.getByLabel('Email or username').fill(journey);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/verify-email-notice');

  // Open the link from the email: the token is removed from the address bar immediately.
  const link = linkFromEmail(await lastEmail(page.request, `${journey}@example.com`));
  await page.goto(link);
  await expect(page).toHaveURL('/verify-email');
  await page.getByRole('button', { name: 'Verify my email' }).click();
  await expect(page.getByText('Your email address is verified.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to your chats' }).click();
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('protected pages send visitors to login and return them afterwards', async ({ page }) => {
  const { username: returner } = await createVerifiedAccount(page.request, {
    username: uniqueName('returner'),
  });
  await page.context().clearCookies();

  await page.goto('/settings');
  await expect(page).toHaveURL('/login?next=%2Fsettings');
  await page.getByLabel('Email or username').fill(`${returner}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL('/settings');
});

test('wrong password shows an error without revealing whether the account exists', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('nobody-here');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password-123');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Incorrect email/username or password');
});

test('forgot password → reset link → log in with the new password', async ({ page }) => {
  const { username: forgetful } = await createVerifiedAccount(page.request, {
    username: uniqueName('forgetful'),
  });
  await page.context().clearCookies();
  const newPassword = 'green-mountain-tea-77';

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(`${forgetful}@example.com`);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();

  await page.goto(linkFromEmail(await lastEmail(page.request, `${forgetful}@example.com`)));
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your password was changed. Please log in again.')).toBeVisible();

  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByLabel('Email or username').fill(forgetful);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
});

test('journey 11–12: edit profile, then log out and lose access', async ({ page }) => {
  const { username: profiler } = await createVerifiedAccount(page.request, {
    username: uniqueName('profiler'),
    displayName: 'Profiler',
  });

  // Settings → Edit profile → Name: a page of its own; Save stays off until something changes.
  await page.goto('/settings');
  await page.getByRole('link', { name: /Edit profile/ }).click();
  await page.getByRole('link', { name: /Name/ }).click();
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await page.getByRole('textbox', { name: 'Name' }).fill('Profile Changed');
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await expect(page).toHaveURL('/settings/profile'); // back to Edit profile after saving
  await page.reload();
  await expect(page.getByRole('link', { name: /Name/ })).toContainText('Profile Changed');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL('/settings');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login'); // no "?next=/settings" after a deliberate logout
  await page.goto('/chats');
  await expect(page).toHaveURL('/login?next=%2Fchats');

  // Logging in again after logging out opens the chats, not the page you logged out from.
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(profiler);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/chats');
});

test('signing out other devices from the sessions list', async ({ page, browser }) => {
  const { username: twodevices } = await createVerifiedAccount(page.request, {
    username: uniqueName('twodevices'),
  });
  const otherDevice = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const otherPage = await otherDevice.newPage();
  await otherPage.goto('/login');
  await otherPage.getByLabel('Email or username').fill(twodevices);
  await otherPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await otherPage.getByRole('button', { name: 'Log in' }).click();
  await expect(otherPage.getByRole('heading', { name: 'Chats' })).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('link', { name: /Where you’re signed in/ }).click();
  await expect(page.getByText('This device')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out all other devices' }).click();
  await expect(page.getByRole('button', { name: 'Sign out all other devices' })).toBeHidden();

  await otherPage.reload();
  await expect(otherPage).toHaveURL(/\/login/);
  await otherDevice.close();
});
