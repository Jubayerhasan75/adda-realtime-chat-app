import { NOTIFICATION_PREVIEWS } from '@chat/shared';
import { BellOff, BellRing, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { cn } from '../../lib/cn.js';
import { useUpdateSettings } from '../settings/api.js';
import { disablePushOnThisDevice, enablePush, hasPushSubscription, pushStatus } from './push.js';

const PREVIEW_LABELS = {
  name_and_text: ['Name and message', 'Jubayer: “See you at 10”'],
  name_only: ['Name only', 'Jubayer: New message'],
  none: ['Nothing', 'Adda: New message'],
};

/** This device: can it get notifications, and are they on? */
function DeviceNotifications() {
  const [status, setStatus] = useState(pushStatus);
  const [subscribed, setSubscribed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    hasPushSubscription().then((value) => !cancelled && setSubscribed(value));
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus(pushStatus());
      setSubscribed(await hasPushSubscription());
      setBusy(false);
    }
  };

  if (status === 'unsupported') {
    return <p className="text-sm text-muted">This browser can’t show notifications.</p>;
  }
  if (status === 'needs-install') {
    return (
      <p className="text-sm text-text">
        On iPhone and iPad, notifications work after you add the app to your Home Screen (Settings →
        Install Adda), then open it from there.
      </p>
    );
  }
  if (status === 'denied') {
    return (
      <Alert tone="info">
        Notifications are blocked for this site. Allow them in your browser’s site settings (the
        lock icon next to the address, or your phone’s Settings → Notifications), then come back.
      </Alert>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3">
      {status === 'granted' && subscribed ? (
        <>
          <p className="flex items-center gap-2 text-sm text-text">
            <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
            Notifications are on for this device.
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => run(disablePushOnThisDevice)}
          >
            <BellOff aria-hidden="true" className="size-4" />
            Turn off on this device
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-text">
            Get notified about new messages when the app is closed or in the background.
          </p>
          <Button size="sm" loading={busy} onClick={() => run(enablePush)}>
            <BellRing aria-hidden="true" className="size-4" />
            Turn on notifications
          </Button>
        </>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

/** Notifications: this device's permission plus account-wide choices. */
export function NotificationSettings({ notifications }) {
  const update = useUpdateSettings();
  const save = (changes) => update.mutate({ notifications: changes });

  return (
    <div className="flex flex-col gap-4">
      <DeviceNotifications />
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <Switch
          label="Message notifications"
          description="Off: no notifications on any of your devices. Muted chats are always silent."
          checked={notifications.enabled}
          onChange={(on) => save({ enabled: on })}
        />
        <Switch
          label="Friend requests"
          description="When someone sends or accepts a friend request."
          checked={notifications.friendRequests}
          onChange={(on) => save({ friendRequests: on })}
          disabled={!notifications.enabled}
        />
      </div>
      <fieldset disabled={!notifications.enabled}>
        <legend className="mb-2 text-[15px] text-text">What the lock screen shows</legend>
        <div className="flex flex-col gap-2">
          {NOTIFICATION_PREVIEWS.map((value) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus-ring)',
                notifications.preview === value
                  ? 'border-primary bg-primary-soft'
                  : 'border-border hover:bg-surface-hover',
              )}
            >
              <input
                type="radio"
                name="notification-preview"
                value={value}
                checked={notifications.preview === value}
                onChange={() => save({ preview: value })}
                className="size-4 accent-(--primary)"
              />
              <span className="flex flex-col">
                <span className="text-[15px] text-text">{PREVIEW_LABELS[value][0]}</span>
                <span className="text-xs text-muted">{PREVIEW_LABELS[value][1]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {update.isError && <Alert tone="error">{update.error.message}</Alert>}
    </div>
  );
}
