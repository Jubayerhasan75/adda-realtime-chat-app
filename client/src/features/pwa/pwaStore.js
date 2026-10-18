import { useSyncExternalStore } from 'react';

/**
 * Installable-app state shared by the update banner and the "Install app" settings:
 * - `updateReady`: a new version is downloaded and waits for the user to tap Reload;
 * - `updateDismissed`: the user tapped "Later" (the banner comes back on the next check);
 * - `installPrompt`: the browser's install offer (Android/desktop Chrome and Edge only).
 */
let state = { updateReady: false, updateDismissed: false, installPrompt: null, installed: false };
let applyUpdate = () => {};
let registration = null;
const listeners = new Set();

function set(changes) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
}

export function usePwa() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Called by the service worker registration when a new version is waiting. */
export function setUpdateReady(update) {
  applyUpdate = update;
  set({ updateReady: true, updateDismissed: false });
}

export function dismissUpdate() {
  set({ updateDismissed: true });
}

export function setRegistration(value) {
  registration = value;
}

/**
 * Asks the server for a newer version now. Resolves to 'available' (the banner shows),
 * 'latest', or 'unavailable' (no service worker, e.g. in development).
 */
export async function checkForUpdates() {
  if (!registration) return 'unavailable';
  await registration.update();
  if (registration.waiting || registration.installing) {
    set({ updateDismissed: false });
    return 'available';
  }
  return state.updateReady ? 'available' : 'latest';
}

export function reloadToUpdate() {
  applyUpdate();
}

/** True when running as the installed app (home screen / app window), not in a browser tab. */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/** iPhone/iPad Safari: installing works only through Share → Add to Home Screen. */
export function isIos() {
  const { userAgent, maxTouchPoints } = window.navigator;
  // iPadOS reports itself as a Mac; touch support tells them apart.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // show our own button instead of the browser's mini-bar
    set({ installPrompt: event });
  });
  window.addEventListener('appinstalled', () => set({ installPrompt: null, installed: true }));
}

export async function promptInstall() {
  const prompt = state.installPrompt;
  if (!prompt) return;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  set({ installPrompt: null, installed: outcome === 'accepted' });
}

/**
 * Where this browser keeps its own "Install" command, for when it doesn't let the page open the
 * install dialog (Safari, Firefox, or after the user dismissed the browser's offer).
 */
export function browserInstallSteps(userAgent = navigator.userAgent) {
  if (/Android/.test(userAgent)) {
    if (/SamsungBrowser/.test(userAgent)) {
      return ['Tap the menu (☰) at the bottom.', 'Tap “Add page to” → “Home screen”.'];
    }
    return [
      'Tap the browser menu (⋮) at the top right.',
      'Tap “Install app” or “Add to Home screen”.',
    ];
  }
  if (/Edg\//.test(userAgent)) {
    return [
      'Click the “App available” icon at the right end of the address bar,',
      'or open the menu (⋯) → “Apps” → “Install Adda”.',
    ];
  }
  if (/Firefox\//.test(userAgent)) {
    return [
      'Firefox on computers can’t install web apps.',
      'Open Adda in Chrome or Edge to install it.',
    ];
  }
  if (/Chrome\//.test(userAgent)) {
    return [
      'Click the install icon at the right end of the address bar,',
      'or open the menu (⋮) → “Cast, save and share” → “Install page as app”.',
    ];
  }
  if (/Safari\//.test(userAgent) && /Macintosh/.test(userAgent)) {
    return ['In the menu bar, choose “File” → “Add to Dock”.'];
  }
  return ['Open your browser’s menu and choose “Install app” or “Add to Home screen”.'];
}
