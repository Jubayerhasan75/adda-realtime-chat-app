import { CheckCircle2, Download, Share, SquarePlus } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { isIos, isStandalone, promptInstall, usePwa } from './pwaStore.js';

/**
 * "Install the app" in Settings. Android/desktop: the browser's own install dialog. iPhone/iPad:
 * a short Share → Add to Home Screen guide (Apple allows no other way, and notifications only
 * work after installing). Already installed: says so.
 */
export function InstallAppSection() {
  const { installPrompt, installed } = usePwa();

  if (installed || isStandalone()) {
    return (
      <p className="flex items-center gap-2 text-sm text-text">
        <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
        The app is installed on this device.
      </p>
    );
  }

  if (isIos()) {
    return (
      <div className="flex flex-col gap-3 text-sm text-text">
        <p>Install it to get notifications and open it like any other app:</p>
        <ol className="flex flex-col gap-2">
          <li className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-link">
              1
            </span>
            Open this page in <strong>Safari</strong>.
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-link">
              2
            </span>
            Tap <Share aria-label="Share" className="inline size-4" /> <strong>Share</strong>.
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-link">
              3
            </span>
            Choose <SquarePlus aria-hidden="true" className="inline size-4" />{' '}
            <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
        </ol>
        <p className="text-muted">Needs iOS 16.4 or newer for notifications.</p>
      </div>
    );
  }

  if (installPrompt) {
    return (
      <div className="flex flex-col items-start gap-3 text-sm text-text">
        <p>Open the chat from your home screen or desktop like a normal app.</p>
        <Button size="sm" onClick={promptInstall}>
          <Download aria-hidden="true" className="size-4" />
          Install app
        </Button>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted">
      To install, use your browser’s menu (⋮) → <strong>Install app</strong> or{' '}
      <strong>Add to Home screen</strong>.
    </p>
  );
}
