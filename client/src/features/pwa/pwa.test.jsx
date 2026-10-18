import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallAppSection } from './InstallAppSection.jsx';
import { CURRENT_RELEASE } from '../../releaseNotes.js';
import { listenForInstallPrompt, setUpdateReady } from './pwaStore.js';
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

    await userEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(prompt.prompt).toHaveBeenCalled();
    expect(await screen.findByText('The app is installed on this device.')).toBeInTheDocument();
  });
});
