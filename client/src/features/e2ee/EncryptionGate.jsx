import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { apiRequest } from '../../lib/http.js';
import { RestoreEncryption, SetupEncryption } from './EncryptionScreens.jsx';
import { MY_KEYS_KEY, loadDeviceKeyring, useKeyring } from './keyring.js';

/**
 * Chats open only once this device can encrypt and decrypt (docs/E2EE.md §2):
 * no key anywhere yet → set up; key exists but not on this device (or a newer one) → unlock.
 */
export function EncryptionGate({ user, children }) {
  const keyring = useKeyring();
  const [deviceChecked, setDeviceChecked] = useState(false);
  const mine = useQuery({
    queryKey: MY_KEYS_KEY,
    queryFn: () => apiRequest('/api/keys/me'),
    staleTime: Infinity,
  });

  useEffect(() => {
    let cancelled = false;
    loadDeviceKeyring(user.id)
      .catch(() => null)
      .finally(() => !cancelled && setDeviceChecked(true));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (!deviceChecked || mine.isPending) {
    return (
      <div role="status" className="flex h-full items-center justify-center gap-2 bg-bg text-muted">
        <Spinner className="size-5" /> Unlocking your chats…
      </div>
    );
  }
  if (mine.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
        <p className="text-text">Couldn’t load your encryption keys.</p>
        <Button onClick={() => mine.refetch()} loading={mine.isFetching}>
          Try again
        </Button>
      </div>
    );
  }

  const { currentKeyId } = mine.data;
  if (!currentKeyId) return <SetupEncryption user={user} />;
  const ready =
    keyring?.userId === user.id &&
    keyring.currentKeyId === currentKeyId &&
    keyring.keys.some((key) => key.keyId === currentKeyId);
  if (!ready) return <RestoreEncryption user={user} mine={mine.data} />;
  return children;
}
