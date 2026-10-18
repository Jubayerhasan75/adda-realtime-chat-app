import { createContext, useContext } from 'react';

export const ThemeContext = createContext(null);

/** @returns {{ preference: import('./theme.js').ThemePreference, theme: 'light' | 'dark', setPreference: (p: import('./theme.js').ThemePreference) => void }} */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
