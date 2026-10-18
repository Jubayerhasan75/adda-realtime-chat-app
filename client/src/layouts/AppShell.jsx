import { MessageCircle, Settings, Users } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useMatch } from 'react-router';
import { Badge } from '../components/ui/Badge.jsx';
import { ToastRegion } from '../components/ui/Toast.jsx';
import { reportDelivered, useConversations } from '../features/chat/api.js';
import { useNotifications } from '../features/notifications/api.js';
import { WhatsNew } from '../features/pwa/WhatsNew.jsx';
import { ConnectionStatus } from '../features/realtime/ConnectionStatus.jsx';
import { useIsConnected } from '../features/realtime/socketStore.js';
import { useVisualViewport } from '../hooks/useVisualViewport.js';
import { cn } from '../lib/cn.js';

const NAV_ITEMS = [
  { to: '/chats', label: 'Chats', Icon: MessageCircle },
  { to: '/friends', label: 'Friends', Icon: Users },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

/** Icon with an unread count in its corner. */
function NavIcon({ Icon, count, label }) {
  return (
    <span className="relative">
      <Icon aria-hidden="true" className="size-6 lg:size-5" />
      <Badge
        count={count}
        label={label}
        className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px]"
      />
    </span>
  );
}

/**
 * Tells the server "this device received it" for messages that arrived while the app is open,
 * on any screen (docs/ARCHITECTURE.md §6: delivered = a device of the recipient acknowledged).
 */
function DeliveryReporter({ conversations }) {
  const connected = useIsConnected();
  useEffect(() => {
    if (!connected || !conversations) return;
    for (const conversation of conversations) {
      if (conversation.lastSeq > conversation.myState.deliveredUpToSeq) {
        reportDelivered(conversation.id, conversation.lastSeq);
      }
    }
  }, [conversations, connected]);
  return null;
}

/**
 * Signed-in app frame. Phones: content + bottom navigation (hidden inside an open chat so the
 * composer sits at the bottom). Desktop (≥ 1024 px): a navigation rail on the left.
 * The frame follows the visual viewport so the on-screen keyboard never covers the composer.
 */
export function AppShell() {
  useVisualViewport();
  const inChat = useMatch('/chats/:conversationId');
  const notifications = useNotifications();
  const conversations = useConversations();
  const counts = {
    '/chats': conversations.data?.filter((c) => c.unreadCount > 0).length ?? 0,
    '/friends': notifications.data?.unreadCount ?? 0,
  };

  return (
    <div className="fixed inset-x-0 top-[var(--app-offset-top,0px)] flex h-(--app-height) flex-col bg-bg pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] lg:flex-row">
      <nav
        aria-label="Main"
        className="hidden w-(--nav-rail-width) shrink-0 flex-col items-center gap-2 border-r border-border bg-surface py-4 lg:flex"
      >
        <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary">
          A
        </span>
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              cn(
                'flex size-12 flex-col items-center justify-center rounded-lg transition-colors duration-(--duration-fast)',
                isActive
                  ? 'bg-primary-soft text-link'
                  : 'text-muted hover:bg-surface-hover hover:text-text',
              )
            }
          >
            <NavIcon Icon={Icon} count={counts[to] ?? 0} label="new" />
            <span className="sr-only">{label}</span>
          </NavLink>
        ))}
      </nav>

      <DeliveryReporter conversations={conversations.data} />
      <ToastRegion />
      <ConnectionStatus />
      <WhatsNew />
      <main className="flex min-h-0 min-w-0 flex-1">
        <Outlet />
      </main>

      {!inChat && (
        <nav
          aria-label="Main"
          className="flex shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-(--bottom-nav-height) flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-link' : 'text-muted',
                )
              }
            >
              <NavIcon Icon={Icon} count={counts[to] ?? 0} label="new" />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
