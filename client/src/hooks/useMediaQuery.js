import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query and re-renders when it starts or stops matching.
 * @param {string} query e.g. '(min-width: 1024px)'
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
