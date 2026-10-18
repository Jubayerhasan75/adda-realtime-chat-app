import { useEffect, useRef } from 'react';
import { useTheme } from '../settings/useTheme.js';

/**
 * Applies the theme saved on the account once per sign-in, so the choice follows the user
 * across devices. Later changes are local-first (the selector saves them to the account), so
 * a slow save response can never flip the theme back.
 */
export function useSyncAccountTheme(user) {
  const { setPreference } = useTheme();
  const appliedForUser = useRef(null);

  useEffect(() => {
    if (!user || appliedForUser.current === user.id) return;
    appliedForUser.current = user.id;
    if (user.settings?.theme) setPreference(user.settings.theme);
  }, [user, setPreference]);
}
