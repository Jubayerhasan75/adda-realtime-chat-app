import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider.jsx';
import { ThemeSelector } from './ThemeSelector.jsx';
import { resolveTheme } from './theme.js';

function mockSystemDark(dark) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: query === '(prefers-color-scheme: dark)' ? dark : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderSelector() {
  return render(
    <ThemeProvider>
      <ThemeSelector />
    </ThemeProvider>,
  );
}

describe('resolveTheme', () => {
  it('follows the system only when the preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('ThemeProvider + ThemeSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the system theme by default', () => {
    mockSystemDark(true);
    renderSelector();

    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies and remembers an explicit choice', async () => {
    mockSystemDark(true);
    renderSelector();

    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme-preference')).toBe('light');
  });

  it('restores the saved choice and ignores invalid stored values', () => {
    mockSystemDark(false);
    localStorage.setItem('theme-preference', 'dark');
    const { unmount } = renderSelector();
    expect(document.documentElement.dataset.theme).toBe('dark');
    unmount();

    localStorage.setItem('theme-preference', 'purple');
    renderSelector();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
