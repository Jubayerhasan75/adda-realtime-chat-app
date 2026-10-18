/** @typedef {'system' | 'light' | 'dark'} ThemePreference */

export const THEME_PREFERENCES = /** @type {const} */ (['system', 'light', 'dark']);
export const THEME_STORAGE_KEY = 'theme-preference';

const THEME_COLORS = { light: '#592E83', dark: '#18151E' };

/** @returns {ThemePreference} */
export function readStoredPreference() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_PREFERENCES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

/** @param {ThemePreference} preference */
export function storePreference(preference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted on this device; the choice still applies until reload.
  }
}

/**
 * @param {ThemePreference} preference
 * @param {boolean} systemPrefersDark
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(preference, systemPrefersDark) {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/** @param {'light' | 'dark'} theme */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}
