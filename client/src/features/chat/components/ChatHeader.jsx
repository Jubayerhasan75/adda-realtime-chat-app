import { ArrowLeft, EllipsisVertical } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { useNow } from '../../../hooks/useNow.js';
import { formatLastSeen } from '../../../lib/format.js';
import { usePresence } from '../../realtime/presenceStore.js';

function presenceText(presence, typing, now) {
  if (typing) return 'typing…';
  if (presence.online) return 'online';
  if (presence.lastSeenAt) return formatLastSeen(new Date(presence.lastSeenAt), now);
  return ''; // hidden by privacy, or not a friend
}

/**
 * @param {{ peer: object, typing?: boolean, showBack: boolean, onOpenOptions?: () => void }} props
 */
export function ChatHeader({ peer, typing = false, showBack, onOpenOptions }) {
  const presence = usePresence(peer.id);
  const now = useNow();
  const status = presenceText(presence, typing, now);
  return (
    <header className="flex min-h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-surface px-2 pt-[env(safe-area-inset-top)] sm:px-3">
      {showBack && (
        <Link
          to="/chats"
          aria-label="Back to chats"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-text"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
      )}
      <Avatar
        name={peer.displayName}
        src={peer.avatar}
        online={Boolean(presence.online)}
        size="sm"
      />
      <div className="min-w-0 flex-1 pl-1">
        <h1 className="truncate text-[15px] font-semibold text-text">{peer.displayName}</h1>
        <p
          aria-live="polite"
          className={typing ? 'truncate text-xs text-link' : 'truncate text-xs text-muted'}
        >
          {status}
        </p>
      </div>
      {onOpenOptions && (
        <IconButton label="Chat options" onClick={onOpenOptions}>
          <EllipsisVertical aria-hidden="true" className="size-5" />
        </IconButton>
      )}
    </header>
  );
}
