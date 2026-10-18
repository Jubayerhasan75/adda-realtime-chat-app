import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { applyTheme, readStoredPreference, resolveTheme, storePreference } from './theme.js';
import { ThemeContext } from './useTheme.js';

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setPreference = useCallback((next) => {
    storePreference(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
