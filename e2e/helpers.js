import { expect } from '@playwright/test';
import { encryptKeyring } from '../client/src/crypto/backup.js';
import {
  generateIdentityKey,
  importPrivateKey,
  importPublicKey,
} from '../client/src/crypto/keys.js';
import {
  deriveConversationKey,
  encryptEnvelope,
  messageAad,
} from '../client/src/crypto/messageCrypto.js';
export const E2E_ORIGIN = 'http://localhost:4100';
export const PASSWORD = 'purple-river-lamp-42';

/** Files written by auth.setup.js for the shared signed-in account. */
export const SIGNED_IN_STATE = 'e2e/.auth/signed-in.json';
export const SHARED_CHAT = 'e2e/.auth/shared-chat.json';
/** Every test account's end-to-end encryption recovery password. */
export const TEST_PASSPHRASE = 'Mango#river7';

/**
 * Collects console errors and uncaught page errors (CSP violations are reported as console
 * errors), so tests can assert that a journey produced none.
 * @param {import('@playwright/test').Page} page
 */
export function trackConsoleErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Horizontal overflow in CSS pixels; 0 means nothing sticks out sideways. */
export function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/**
 * Test usernames get a random suffix so a retried or repeated test never collides with an
 * account created by an earlier run against the same test database.
 */
export function uniqueName(base) {
  return `${base}_${Math.random().toString(36).slice(2, 7)}`;
}

function randomClientIp() {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

/** Reads the newest email sent to `to` from the test server's in-memory outbox. */
export async function lastEmail(request, to) {
  const response = await request.get(`/api/test/last-email?to=${encodeURIComponent(to)}`);
  if (!response.ok()) throw new Error(`No email for ${to}`);
  return (await response.json()).data;
}

export function linkFromEmail(mail) {
  const match = /(https?:\/\/\S+\?token=[A-Za-z0-9_-]{43})/.exec(mail.text);
  if (!match) throw new Error(`No link in email "${mail.subject}"`);
  return new URL(match[1]).pathname + new URL(match[1]).search;
}

/**
 * Creates a verified account through the API (fast path for tests that aren't about
 * registration). Uses the page's request context, so the login cookie lands in the browser.
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function createVerifiedAccount(request, { username, displayName = username }) {
  const email = `${username}@example.com`;
  // Each test account comes from its own simulated client IP, so the real per-IP
  // registration limit (5/hour) isn't exhausted by the test suite itself.
  const headers = { Origin: E2E_ORIGIN, 'X-Forwarded-For': randomClientIp() };
  const register = await request.post('/api/auth/register', {
    headers,
    data: { email, username, displayName, password: PASSWORD },
  });
  if (register.status() !== 202) throw new Error(`Register failed: ${register.status()}`);

  const token = /token=([A-Za-z0-9_-]{43})/.exec((await lastEmail(request, email)).text)[1];
  await request.post('/api/auth/verify-email', { headers, data: { token } });
  const login = await request.post('/api/auth/login', {
    headers,
    data: { identifier: username, password: PASSWORD },
  });
  if (!login.ok()) throw new Error(`Login failed: ${login.status()}`);
  const { user, csrfToken } = (await login.json()).data;
  const api = apiClient(request, csrfToken);
  // End-to-end encryption, set up exactly like the app does (docs/E2EE.md §2).
  const identity = await generateIdentityKey();
  await api.post('/api/keys/setup', {
    keyId: identity.keyId,
    publicKey: identity.publicKey,
    backup: await encryptKeyring([identity], TEST_PASSPHRASE),
  });
  return { email, username, userId: user.id, csrfToken, api, identity };
}

/**
 * Whenever a test browser shows "Unlock your chats" (keys not on this device yet) or
 * "Protect your chats" (a brand-new account), fill in the test passphrase like a person would.
 * @param {import('@playwright/test').Page} page
 */
export async function autoUnlock(page) {
  const unlock = page.getByRole('heading', { name: 'Unlock your chats' });
  await page.addLocatorHandler(unlock, async () => {
    await page.getByLabel('Recovery password', { exact: true }).fill(TEST_PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(unlock).toBeHidden({ timeout: 30_000 });
  });
  const protect = page.getByRole('heading', { name: 'Protect your chats' });
  await page.addLocatorHandler(protect, async () => {
    await page.getByLabel('Recovery password', { exact: true }).fill(TEST_PASSPHRASE);
    await page.getByLabel('Type it again').fill(TEST_PASSPHRASE);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Turn on encryption' }).click();
    await expect(protect).toBeHidden({ timeout: 30_000 });
  });
}

/** Signed-in API calls (Origin + CSRF token) for arranging test data quickly. */
export function apiClient(request, csrfToken) {
  const headers = { Origin: E2E_ORIGIN, 'X-CSRF-Token': csrfToken };
  const post = async (url, data) => {
    const response = await request.post(url, { headers, data });
    if (!response.ok()) throw new Error(`POST ${url} failed: ${response.status()}`);
    return response.status() === 204 ? null : (await response.json()).data;
  };
  const get = async (url) => {
    const response = await request.get(url, { headers });
    if (!response.ok()) throw new Error(`GET ${url} failed: ${response.status()}`);
    return (await response.json()).data;
  };
  return { post, get };
}

/** Makes two accounts friends and returns their conversation id. */
export async function befriendAndOpenChat(a, b) {
  const request = await a.api.post('/api/friends/requests', { userId: b.userId });
  await b.api.post(`/api/friends/requests/${request.id}/accept`);
  const conversation = await a.api.post('/api/conversations', { peerUserId: b.userId });
  return conversation.id;
}

/** Sends a text message encrypted end-to-end, exactly like the app (docs/E2EE.md §3). */
export async function sendText(account, conversationId, text) {
  const conversation = await account.api.get(`/api/conversations/${conversationId}`);
  const peer = await account.api.get(`/api/keys/users/${conversation.peer.id}`);
  const peerKey = peer.keys.find((key) => key.keyId === peer.currentKeyId);
  const key = await deriveConversationKey(
    await importPrivateKey(account.identity.privateKeyPkcs8),
    await importPublicKey(peerKey.publicKey, peerKey.keyId),
    conversationId,
  );
  const clientMessageId = crypto.randomUUID();
  const envelope = await encryptEnvelope(
    { text },
    {
      key,
      aad: messageAad({ conversationId, senderId: account.userId, clientMessageId }),
      senderKeyId: account.identity.keyId,
      recipientKeyId: peerKey.keyId,
    },
  );
  return account.api.post(`/api/conversations/${conversationId}/messages`, {
    clientMessageId,
    envelope,
  });
}

/** Opens the app in a test browser and unlocks encryption right away, like a person would. */
export async function openApp(page) {
  await page.goto('/chats');
  const chats = page.getByRole('heading', { name: 'Chats', exact: true });
  const unlock = page.getByRole('heading', { name: 'Unlock your chats' });
  await expect(chats.or(unlock).first()).toBeVisible({ timeout: 30_000 });
  if (await unlock.isVisible()) {
    await page.getByLabel('Recovery password', { exact: true }).fill(TEST_PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  }
  await expect(chats).toBeVisible({ timeout: 30_000 });
}
