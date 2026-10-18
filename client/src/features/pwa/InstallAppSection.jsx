import { CheckCircle2, Download, Share, SquarePlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { browserInstallSteps, isIos, isStandalone, promptInstall, usePwa } from './pwaStore.js';

function Step({ number, children }) {
  return (
    <li className="flex items-start gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-link">
        {number}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function IosSteps() {
  return (
    <div className="flex flex-col gap-3 text-sm text-text">
      <p>Install it to get notifications and open it like any other app:</p>
      <ol className="flex flex-col gap-2">
        <Step number={1}>
          Open this page in <strong>Safari</strong>.
        </Step>
        <Step number={2}>
          Tap <Share aria-label="Share" className="inline size-4" /> <strong>Share</strong>.
        </Step>
        <Step number={3}>
          Choose <SquarePlus aria-hidden="true" className="inline size-4" />{' '}
          <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
        </Step>
      </ol>
      <p className="text-muted">Needs iOS 16.4 or newer for notifications.</p>
    </div>
  );
}

/**
 * "Install Adda": one big button. Where the browser allows it (Chrome, Edge, Android) it opens
 * the install dialog straight away; elsewhere it shows exactly where that browser's install
 * command is. iPhone/iPad: Share → Add to Home Screen (Apple allows no other way).
 */
export function InstallAppSection() {
  const { installPrompt, installed } = usePwa();
  const [showSteps, setShowSteps] = useState(false);

  if (installed || isStandalone()) {
    return (
      <p className="flex items-center gap-2 text-sm text-text">
        <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
        The app is installed on this device.
      </p>
    );
  }

  if (isIos()) return <IosSteps />;

  const install = () => {
    if (installPrompt) promptInstall();
    else setShowSteps(true);
  };
  // Browsers only offer installing on a secure (https) site with the app's service worker,
  // which development builds leave off.
  const unavailableHere = import.meta.env.DEV || !window.isSecureContext;

  return (
    <div className="flex flex-col gap-4 text-sm text-text">
      <p>
        Open Adda from your home screen, taskbar or desktop like a normal app — full screen, with
        notifications.
      </p>
      <Button fullWidth onClick={install}>
        <Download aria-hidden="true" className="size-5" />
        Install Adda
      </Button>
      {showSteps && (
        <div role="status" className="flex flex-col gap-2">
          <p className="font-medium">This browser installs apps from its own menu:</p>
          <ol className="flex flex-col gap-2">
            {browserInstallSteps().map((step, index) => (
              <Step key={step} number={index + 1}>
                {step}
              </Step>
            ))}
          </ol>
          {unavailableHere && (
            <p className="text-muted">
              Installing works on the live site (a secure https link). This development version
              can’t be installed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
