import { useSyncExternalStore } from 'react';

// Chat backgrounds are kept on this device only (IndexedDB): a chosen photo is never uploaded.

const DB_NAME = 'adda-wallpapers';
const STORE = 'wallpapers';
const MAX_SIDE = 1600;

export const WALLPAPER_PRESETS = [
  {
    id: 'dusk',
    label: 'Dusk',
    css: 'linear-gradient(160deg, #3b1d57 0%, #8a2958 55%, #f28b50 100%)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    css: 'linear-gradient(160deg, #0b3954 0%, #1d5a85 50%, #3fb6c6 100%)',
  },
  {
    id: 'forest',
    label: 'Forest',
    css: 'linear-gradient(160deg, #10302a 0%, #1d6650 55%, #8fc27c 100%)',
  },
  {
    id: 'candy',
    label: 'Candy',
    css: 'linear-gradient(160deg, #ffd1e8 0%, #e3c8ff 50%, #c4e3ff 100%)',
  },
  {
    id: 'night',
    label: 'Night',
    css: 'radial-gradient(circle at 30% 20%, #2b2740 0%, #0f0d14 70%)',
  },
];

/** How strongly the background is dimmed so messages stay readable. */
export const DIM_LEVELS = { light: 0.2, medium: 0.4, strong: 0.6 };

const cache = new Map(); // key → { kind, presetId?, url?, dim }
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  });
}

function toView(stored) {
  if (!stored) return null;
  return {
    kind: stored.kind,
    presetId: stored.presetId ?? null,
    url: stored.blob ? URL.createObjectURL(stored.blob) : null,
    dim: stored.dim ?? 'medium',
  };
}

const keyOf = (userId, conversationId) => `${userId}:${conversationId}`;

async function load(key) {
  try {
    cache.set(key, toView(await run('readonly', (store) => store.get(key))));
  } catch {
    cache.set(key, null);
  }
  emit();
}

/** This chat's background on this device, or null. */
export function useWallpaper(userId, conversationId) {
  const key = keyOf(userId, conversationId);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      if (!cache.has(key)) {
        cache.set(key, null);
        load(key);
      }
      return () => listeners.delete(listener);
    },
    () => cache.get(key) ?? null,
  );
}

async function resizePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('This photo can’t be used');
  return blob;
}

async function save(userId, conversationId, value) {
  const key = keyOf(userId, conversationId);
  const previous = cache.get(key);
  if (value) await run('readwrite', (store) => store.put(value, key));
  else await run('readwrite', (store) => store.delete(key));
  if (previous?.url) URL.revokeObjectURL(previous.url);
  cache.set(key, toView(value));
  emit();
}

export async function setWallpaperPhoto(userId, conversationId, file, dim = 'medium') {
  await save(userId, conversationId, { kind: 'photo', blob: await resizePhoto(file), dim });
}

export function setWallpaperPreset(userId, conversationId, presetId, dim = 'light') {
  return save(userId, conversationId, { kind: 'preset', presetId, dim });
}

export async function setWallpaperDim(userId, conversationId, dim) {
  const key = keyOf(userId, conversationId);
  const stored = await run('readonly', (store) => store.get(key));
  if (stored) await save(userId, conversationId, { ...stored, dim });
}

export const clearWallpaper = (userId, conversationId) => save(userId, conversationId, null);
