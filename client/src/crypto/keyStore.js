/**
 * This device's private keys (docs/E2EE.md §2), in IndexedDB as non-extractable CryptoKeys:
 * the app can use them, but no script can read their bytes. The service worker reads the same
 * store to show notification previews. Removed on logout. Falls back to memory where
 * IndexedDB is missing (tests, very old browsers), which simply means "ask again next time".
 *
 * Keyring: { userId, currentKeyId, keys: [{ keyId, publicKey, privateKey: CryptoKey }] }
 */
const DB_NAME = 'adda-keys';
const STORE = 'keyrings';

let dbPromise = null;
const memory = new Map();

export function openKeyDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'userId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function run(mode, action) {
  const db = await openKeyDb();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadKeyring(userId) {
  const db = await openKeyDb();
  if (!db) return memory.get(userId) ?? null;
  return (await run('readonly', (store) => store.get(userId))) ?? null;
}

export async function saveKeyring(keyring) {
  const db = await openKeyDb();
  if (!db) {
    memory.set(keyring.userId, keyring);
    return;
  }
  await run('readwrite', (store) => store.put(keyring));
}

/** Logout / switching accounts: no keys stay on the device. */
export async function clearKeyrings() {
  memory.clear();
  const db = await openKeyDb();
  if (db) await run('readwrite', (store) => store.clear());
}
