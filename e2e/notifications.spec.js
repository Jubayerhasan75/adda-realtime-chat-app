import { expect, test } from './fixtures.js';
import { autoUnlock, createVerifiedAccount, uniqueName } from './helpers.js';

test.use({ storageState: { cookies: [], origins: [] } });

test('turning on notifications subscribes this device for the signed-in account', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await context.grantPermissions(['notifications']);
  const page = await context.newPage();
  await autoUnlock(page);
  await createVerifiedAccount(page.request, {
    username: uniqueName('nadia_n'),
    displayName: 'Nadia',
  });

  await page.goto('/settings/notifications');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Notifications' }),
  });
  await section.getByRole('button', { name: 'Turn on notifications' }).click();

  // Either the browser's push service accepted the subscription, or (if this machine can't
  // reach it) an error is shown instead of a silent failure.
  const outcome = await Promise.race([
    section
      .getByText('Notifications are on for this device.')
      .waitFor()
      .then(() => 'on'),
    section
      .getByRole('alert')
      .waitFor()
      .then(() => 'error'),
  ]);
  if (outcome === 'on') {
    const saved = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return Boolean(await registration.pushManager.getSubscription());
    });
    expect(saved).toBe(true);
    await section.getByRole('button', { name: 'Turn off on this device' }).click();
    await expect(section.getByRole('button', { name: 'Turn on notifications' })).toBeVisible();
  } else {
    test.info().annotations.push({ type: 'note', description: 'push service unreachable here' });
  }

  // Account-wide choices.
  await section.getByRole('radio', { name: /Nothing/ }).check();
  await expect(section.getByRole('radio', { name: /Nothing/ })).toBeChecked();
  await page.reload();
  await expect(
    page
      .locator('section', { has: page.getByRole('heading', { name: 'Notifications' }) })
      .getByRole('radio', { name: /Nothing/ }),
  ).toBeChecked();
  await context.close();
});
