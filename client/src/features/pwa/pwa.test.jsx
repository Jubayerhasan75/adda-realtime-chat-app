import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallAppSection } from './InstallAppSection.jsx';
import { CURRENT_RELEASE } from '../../releaseNotes.js';
import { browserInstallSteps, listenForInstallPrompt, setUpdateReady } from './pwaStore.js';
import { UpdateBanner } from './UpdateBanner.jsx';
import { WhatsNew } from './WhatsNew.jsx';

function stubDevice({ userAgent = 'Mozilla/5.0 (Windows NT 10.0)', standalone = false } = {}) {
  vi.stubGlobal('navigator', { ...navigator, userAgent, maxTouchPoints: 0, standalone });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: query === '(display-mode: standalone)' && standalone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('installable app', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks before switching to a new version; "Later" hides it until the next check', async () => {
    const update = vi.fn();
    render(<UpdateBanner />);
    expect(screen.queryByText(/new version/)).not.toBeInTheDocument();

    act(() => setUpdateReady(update));
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(/new version/)).not.toBeInTheDocument();

    act(() => setUpdateReady(update)); // found again on the next check
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(update).toHaveBeenCalledOnce();
  });

  it('shows "What’s new" once after an update, never on a first visit', async () => {
    localStorage.clear();
    const { unmount } = render(<WhatsNew />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    localStorage.setItem('adda.seen-version', '0.9.0');
    render(<WhatsNew />);
    const dialog = screen.getByRole('dialog', {
      name: `What’s new in Adda ${CURRENT_RELEASE.version}`,
    });
    expect(dialog).toHaveTextContent(CURRENT_RELEASE.notes[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(localStorage.getItem('adda.seen-version')).toBe(CURRENT_RELEASE.version);
  });

  it('guides iPhone users through Share → Add to Home Screen', () => {
    stubDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
    render(<InstallAppSection />);
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
    expect(screen.getByText(/iOS 16.4 or newer/)).toBeInTheDocument();
  });

  it('without the browser’s offer, the button shows where this browser installs apps', async () => {
    stubDevice({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0',
    });
    render(<InstallAppSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Install Adda' }));
    expect(screen.getByRole('status')).toHaveTextContent('“Apps” → “Install Adda”');
  });

  it('knows each browser’s own install command', () => {
    expect(browserInstallSteps('Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile')[1]).toMatch(
      /Install app/,
    );
    expect(browserInstallSteps('Mozilla/5.0 (Windows NT 10.0) Gecko Firefox/140.0')[1]).toMatch(
      /Chrome or Edge/,
    );
    expect(
      browserInstallSteps('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/18.0 Safari/605.1'),
    ).toEqual(['In the menu bar, choose “File” → “Add to Dock”.']);
  });

  it('says so when already running as the installed app', () => {
    stubDevice({ standalone: true });
    render(<InstallAppSection />);
    expect(screen.getByText('The app is installed on this device.')).toBeInTheDocument();
  });

  // Runs last: once installed, the shared install state stays "installed".
  it('offers the browser’s install dialog on Android and desktop', async () => {
    stubDevice();
    listenForInstallPrompt();
    render(<InstallAppSection />);
    const prompt = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    act(() => window.dispatchEvent(prompt));

    await userEvent.click(screen.getByRole('button', { name: 'Install Adda' }));
    expect(prompt.prompt).toHaveBeenCalled();
    expect(await screen.findByText('The app is installed on this device.')).toBeInTheDocument();
  });
});
