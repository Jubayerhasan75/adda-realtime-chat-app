import { useSyncExternalStore } from 'react';
import { decryptKeyring, encryptKeyring } from '../../crypto/backup.js';
import { generateIdentityKey, importPrivateKey, importPublicKey } from '../../crypto/keys.js';
import { clearKeyrings, loadKeyring, saveKeyring } from '../../crypto/keyStore.js';
import {
  decryptEnvelope,
  deriveConversationKey,
  encryptEnvelope,
  messageAad,
} from '../../crypto/messageCrypto.js';
import { apiRequest } from '../../lib/http.js';

/**
 * This device's encryption state (docs/E2EE.md): the unlocked keyring, friends' public keys,
 * and per-conversation keys. Nothing here is ever sent to the server in readable form.
 */
export const MY_KEYS_KEY = ['keys', 'me'];

let keyring = null; // { userId, currentKeyId, keys: [{ keyId, publicKey, privateKey }] }
const listeners = new Set();
const peerKeys = new Map(); // userId → Promise<{ currentKeyId, byId: Map<keyId, CryptoKey> }>
const conversationKeys = new Map(); // `${conversationId}|${myKeyId}|${theirKeyId}` → AES key

function setKeyring(value) {
  keyring = value;
  conversationKeys.clear();
  listeners.forEach((listener) => listener());
}

export function useKeyring() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => keyring,
  );
}

export const getKeyring = () => keyring;

/** The device keyring for this user, if this device has been set up. */
export async function loadDeviceKeyring(userId) {
  const stored = await loadKeyring(userId);
  setKeyring(stored);
  return stored;
}

async function install(userId, entries, currentKeyId) {
  const keys = await Promise.all(
    entries.map(async (entry) => ({
      keyId: entry.keyId,
      publicKey: entry.publicKey,
      privateKey: await importPrivateKey(entry.privateKeyPkcs8),
    })),
  );
  const value = { userId, currentKeyId, keys };
  await saveKeyring(value);
  setKeyring(value);
  return value;
}

/** First time: new identity key, locked with the passphrase, registered with the server. */
export async function setUpEncryption(userId, passphrase) {
  const identity = await generateIdentityKey();
  const backup = await encryptKeyring([identity], passphrase);
  await apiRequest('/api/keys/setup', {
    method: 'POST',
    body: { keyId: identity.keyId, publicKey: identity.publicKey, backup },
  });
  return install(userId, [identity], identity.keyId);
}

/** New device / after logout: unlock the backup with the passphrase. */
export async function restoreEncryption(userId, mine, passphrase) {
  const entries = await decryptKeyring(mine.backup, passphrase);
  if (!entries.some((entry) => entry.keyId === mine.currentKeyId)) {
    throw new Error('This backup doesn’t contain your current key. Reset encryption instead.');
  }
  return install(userId, entries, mine.currentKeyId);
}

/**
 * Forgotten passphrase: a brand-new key (old messages become unreadable on new devices).
 * Keeps any keys this device still has, so nothing more is lost than necessary.
 */
export async function resetEncryption(userId, { password, passphrase }) {
  const identity = await generateIdentityKey();
  const backup = await encryptKeyring([identity], passphrase);
  await apiRequest('/api/keys/rotate', {
    method: 'POST',
    body: { keyId: identity.keyId, publicKey: identity.publicKey, backup, password },
  });
  return install(userId, [identity], identity.keyId);
}

export async function forgetDeviceKeys() {
  setKeyring(null);
  peerKeys.clear();
  await clearKeyrings();
}

/** Someone changed keys: fetch theirs again next time. */
export function forgetPeerKeys(userId) {
  peerKeys.delete(userId);
  for (const id of conversationKeys.keys()) conversationKeys.delete(id);
}

function fetchPeerKeys(userId) {
  if (!peerKeys.has(userId)) {
    const request = apiRequest(`/api/keys/users/${userId}`).then(async (data) => {
      const byId = new Map();
      await Promise.all(
        data.keys.map(async (key) =>
          byId.set(key.keyId, await importPublicKey(key.publicKey, key.keyId)),
        ),
      );
      return { currentKeyId: data.currentKeyId, byId, keys: data.keys };
    });
    request.catch(() => peerKeys.delete(userId));
    peerKeys.set(userId, request);
  }
  return peerKeys.get(userId);
}

export async function peerPublicKeys(userId) {
  return fetchPeerKeys(userId);
}

async function conversationKey(conversationId, myKeyId, peerId, peerKeyId) {
  const cacheKey = `${conversationId}|${myKeyId}|${peerKeyId}`;
  if (!conversationKeys.has(cacheKey)) {
    const mine = keyring?.keys.find((key) => key.keyId === myKeyId);
    if (!mine) throw Object.assign(new Error('Key not on this device'), { code: 'NO_KEY' });
    let peer = await fetchPeerKeys(peerId);
    if (!peer.byId.has(peerKeyId)) {
      forgetPeerKeys(peerId); // maybe a brand-new key: fetch once more
      peer = await fetchPeerKeys(peerId);
    }
    const theirs = peer.byId.get(peerKeyId);
    if (!theirs) throw Object.assign(new Error('Unknown key'), { code: 'NO_KEY' });
    conversationKeys.set(
      cacheKey,
      deriveConversationKey(mine.privateKey, theirs, conversationId).catch((err) => {
        conversationKeys.delete(cacheKey);
        throw err;
      }),
    );
  }
  return conversationKeys.get(cacheKey);
}

/** Encrypts message content for the other person (docs/E2EE.md §3). */
export async function encryptForPeer({
  conversationId,
  peerId,
  senderId,
  clientMessageId,
  content,
}) {
  if (!keyring) throw Object.assign(new Error('Encryption isn’t unlocked'), { code: 'NO_KEY' });
  const peer = await fetchPeerKeys(peerId);
  if (!peer.currentKeyId) {
    throw Object.assign(
      new Error('Your friend hasn’t set up encryption yet. They need to open Adda once.'),
      { code: 'PEER_NO_KEY' },
    );
  }
  const key = await conversationKey(
    conversationId,
    keyring.currentKeyId,
    peerId,
    peer.currentKeyId,
  );
  return encryptEnvelope(content, {
    key,
    aad: messageAad({ conversationId, senderId, clientMessageId }),
    senderKeyId: keyring.currentKeyId,
    recipientKeyId: peer.currentKeyId,
  });
}

/**
 * Decrypts a stored envelope. `peerId` = the other member of the conversation; which of my
 * keys/their keys to use comes from the envelope (old messages use old keys).
 */
export async function decryptFromEnvelope({
  envelope,
  conversationId,
  senderId,
  clientMessageId,
  peerId,
  myUserId,
}) {
  const iAmSender = senderId === myUserId;
  const myKeyId = iAmSender ? envelope.sk : envelope.rk;
  const peerKeyId = iAmSender ? envelope.rk : envelope.sk;
  const key = await conversationKey(conversationId, myKeyId, peerId, peerKeyId);
  return decryptEnvelope(envelope, {
    key,
    aad: messageAad({ conversationId, senderId, clientMessageId }),
  });
}
