import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { CURRENT_RELEASE } from '../../releaseNotes.js';
import { checkForUpdates, reloadToUpdate, usePwa } from './pwaStore.js';

const BUILD = import.meta.env.VITE_APP_BUILD ?? 'dev';

/** Settings → About & updates: the version, and "Check for updates" right now. */
export function AboutSection() {
  const { updateReady } = usePwa();
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      setResult(await checkForUpdates());
    } catch {
      setResult('error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-3 text-sm">
      <p className="text-text">
        Adda {CURRENT_RELEASE.version}{' '}
        <span className="text-muted">
          (build {BUILD}, {CURRENT_RELEASE.date})
        </span>
      </p>
      {updateReady ? (
        <Button size="sm" onClick={reloadToUpdate}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Update now
        </Button>
      ) : (
        <Button size="sm" variant="secondary" loading={checking} onClick={check}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Check for updates
        </Button>
      )}
      <p role="status" className="text-muted">
        {result === 'latest' && (
          <span className="flex items-center gap-1.5 text-text">
            <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            You have the latest version.
          </span>
        )}
        {result === 'available' && !updateReady && 'Downloading the new version…'}
        {result === 'unavailable' && 'Updates are checked automatically in the installed app.'}
        {result === 'error' && 'Couldn’t check right now. Try again when you’re online.'}
      </p>
    </div>
  );
}
