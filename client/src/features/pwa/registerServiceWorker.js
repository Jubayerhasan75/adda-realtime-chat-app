import { registerSW } from 'virtual:pwa-register';
import { router } from '../../app/router.jsx';
import {
  checkForUpdates,
  listenForInstallPrompt,
  setRegistration,
  setUpdateReady,
} from './pwaStore.js';

const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * Registers the service worker in production builds. When a new version has been downloaded,
 * the app shows "New version available — Reload" instead of switching by itself.
 */
export function registerServiceWorker() {
  listenForInstallPrompt();
  if (!('serviceWorker' in navigator)) return;
  // A tapped notification asks the open app to show that chat (no page reload).
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'open' && typeof event.data.path === 'string') {
      if (event.data.path.startsWith('/')) router.navigate(event.data.path);
    }
  });
  const updateSW = registerSW({
    onNeedRefresh: () => setUpdateReady(() => updateSW(true)),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      setRegistration(registration);
      const check = () => checkForUpdates().catch(() => {});
      // A new deploy is noticed when the app is opened or brought back to the screen, and
      // every 30 minutes while it stays open.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, UPDATE_CHECK_MS);
    },
  });
}
