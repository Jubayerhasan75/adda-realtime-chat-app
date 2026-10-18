/**
 * IndexedDB persistence for unsent messages, so text typed while offline survives a reload or a
 * closed tab (docs/ARCHITECTURE.md §7). Stored only on this device and cleared on logout.
 * Every function degrades to a no-op where IndexedDB is unavailable (old browsers, tests).
 */
const DB_NAME = 'private-chat';
const STORE = 'outbox';

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'clientMessageId' });
      store.createIndex('userId', 'userId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function run(mode, action) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => resolve(undefined);
  });
}

export const outboxStorage = {
  /** @returns {Promise<object[]>} the user's unsent messages */
  async load(userId) {
    return (await run('readonly', (store) => store.index('userId').getAll(userId))) ?? [];
  },
  save(item) {
    return run('readwrite', (store) => store.put(item));
  },
  remove(clientMessageId) {
    return run('readwrite', (store) => store.delete(clientMessageId));
  },
  /** Removes every stored message (logout / account deletion on this device). */
  clear() {
    return run('readwrite', (store) => store.clear());
  },
};
