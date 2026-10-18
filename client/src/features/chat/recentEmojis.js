const STORAGE_KEY = 'chat.recent-emojis';
const MAX_RECENT = 24;

/** Emojis I used most recently on this device (newest first). Empty if storage is blocked. */
export function loadRecentEmojis() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved)
      ? saved.filter((e) => typeof e === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji) {
  const next = [emoji, ...loadRecentEmojis().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage blocked: recents just aren't kept.
  }
  return next;
}
