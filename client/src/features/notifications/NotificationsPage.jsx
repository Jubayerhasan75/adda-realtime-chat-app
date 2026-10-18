import { BellOff, ShieldAlert, UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { formatListTimestamp } from '../../lib/format.js';
import { PageLayout } from '../../layouts/PageLayout.jsx';
import { ProfileDialog } from '../friends/components/ProfileDialog.jsx';
import { useMarkAllNotificationsRead, useNotifications } from './api.js';

const SECURITY_TEXT = {
  login: (item) => `New sign-in to your account${item.device ? ` on ${item.device}` : ''}`,
  password_changed: () => 'Your password was changed',
  password_reset: () => 'Your password was reset',
  email_changed: () => 'Your email address was changed',
  username_changed: () => 'Your username was changed',
  encryption_reset: () =>
    'Your encryption keys were reset. Friends will see that your security code changed.',
};

const FRIEND_TEXT = {
  friend_request: 'sent you a friend request',
  friend_accepted: 'accepted your friend request',
};

function Time({ value }) {
  return (
    <time className="text-xs text-subtle" dateTime={value}>
      {formatListTimestamp(new Date(value))}
    </time>
  );
}

const rowClasses =
  'flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-(--duration-fast) hover:bg-surface-hover active:bg-surface-active';

/** One notification: friend activity (opens the person) or a security alert (opens devices). */
function NotificationRow({ item, onOpenPerson }) {
  const navigate = useNavigate();
  const unread = !item.readAt;

  if (item.type === 'security') {
    return (
      <li>
        <button type="button" className={rowClasses} onClick={() => navigate('/settings/devices')}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white">
            <ShieldAlert aria-hidden="true" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] text-text">{SECURITY_TEXT[item.event]?.(item)}</span>
            <span className="block text-sm text-muted">
              If this wasn’t you, change your password and sign out other devices.
            </span>
            <Time value={item.createdAt} />
          </span>
          {unread && (
            <span aria-label="New" className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" />
          )}
        </button>
      </li>
    );
  }

  const Icon = item.type === 'friend_request' ? UserPlus : UserCheck;
  return (
    <li>
      <button
        type="button"
        className={rowClasses}
        onClick={() =>
          item.type === 'friend_request'
            ? navigate('/friends?tab=requests')
            : onOpenPerson(item.actor)
        }
      >
        <span className="relative shrink-0">
          <Avatar name={item.actor.displayName} src={item.actor.avatar} />
          <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-primary text-on-primary">
            <Icon aria-hidden="true" className="size-3" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-text">
            <span className="font-semibold">{item.actor.displayName}</span> {FRIEND_TEXT[item.type]}
          </span>
          <Time value={item.createdAt} />
        </span>
        {unread && (
          <span aria-label="New" className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" />
        )}
      </button>
    </li>
  );
}

function Group({ title, items, onOpenPerson }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-2 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <ul aria-label={title}>
        {items.map((item) => (
          <NotificationRow key={item.id} item={item} onOpenPerson={onOpenPerson} />
        ))}
      </ul>
    </section>
  );
}

/** Everything that happened: friend requests and accepts, plus security alerts. */
export function NotificationsPage() {
  const notifications = useNotifications();
  const markRead = useMarkAllNotificationsRead();
  const [openUsername, setOpenUsername] = useState(null);
  const unread = notifications.data?.unreadCount ?? 0;

  // Opening this page counts as seeing them. Not retried after a failure (no request loop).
  useEffect(() => {
    if (unread > 0 && !markRead.isPending && !markRead.isError) markRead.mutate();
  }, [unread, markRead]);

  const items = notifications.data?.items ?? [];
  // Split on what was unread when the page opened, so "New" doesn't empty itself instantly.
  const [newIds] = useState(() => new Set());
  for (const item of items) if (!item.readAt) newIds.add(item.id);

  return (
    <PageLayout title="Notifications">
      {notifications.isPending && (
        <div className="flex flex-col gap-3" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}
      {notifications.isError && (
        <Alert tone="error">
          {notifications.error.message}{' '}
          <button type="button" className="underline" onClick={() => notifications.refetch()}>
            Try again
          </button>
        </Alert>
      )}
      {notifications.data && items.length === 0 && (
        <EmptyState
          icon={<BellOff aria-hidden="true" className="size-6" />}
          title="No notifications yet"
          description="Friend requests and important account alerts will show up here."
        />
      )}
      {items.length > 0 && (
        <div className="flex flex-col gap-5">
          <Group
            title="New"
            items={items.filter((item) => newIds.has(item.id))}
            onOpenPerson={(user) => setOpenUsername(user.username)}
          />
          <Group
            title="Earlier"
            items={items.filter((item) => !newIds.has(item.id))}
            onOpenPerson={(user) => setOpenUsername(user.username)}
          />
        </div>
      )}
      <ProfileDialog username={openUsername} onClose={() => setOpenUsername(null)} />
    </PageLayout>
  );
}
