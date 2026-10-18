import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { useIsConnected } from './socketStore.js';

// Short drops (switching networks, the first connect) shouldn't flash a warning.
const SHOW_AFTER_MS = 2500;

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Small pill under the header while the live connection is down: "You're offline" or
 * "Connecting…" (e.g. while the free server wakes up). Messages typed meanwhile wait in the
 * outbox and are sent automatically.
 */
export function ConnectionStatus() {
  const connected = useIsConnected();
  const online = useOnline();
  const [visible, setVisible] = useState(false);

  const healthy = connected && online;
  useEffect(() => {
    if (healthy) return undefined;
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setVisible(false);
    };
  }, [healthy]);

  if (healthy || !visible) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 flex justify-center"
    >
      <span className="flex items-center gap-2 rounded-full bg-text px-3 py-1.5 text-xs font-medium text-surface shadow-md">
        {online ? (
          <>
            <Spinner className="size-3.5" /> Connecting…
          </>
        ) : (
          <>
            <WifiOff aria-hidden="true" className="size-3.5" /> You’re offline — messages will send
            when you’re back
          </>
        )}
      </span>
    </div>
  );
}
