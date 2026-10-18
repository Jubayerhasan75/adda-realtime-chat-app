// Applies the saved theme before the first paint to avoid a light/dark flash.
// Loaded as a blocking same-origin script because the CSP forbids inline scripts.
// Keep the storage key and logic in sync with src/features/settings/theme.js.
(function () {
  var preference = 'system';
  try {
    preference = localStorage.getItem('theme-preference') || 'system';
  } catch (_error) {
    // Storage can be unavailable (private mode); fall back to the system theme.
  }
  var dark =
    preference === 'dark' ||
    (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
