import { ArrowLeft, EllipsisVertical } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { useNow } from '../../../hooks/useNow.js';
import { formatLastSeen } from '../../../lib/format.js';
import { usePresence, useOnlineIds } from '../../realtime/presenceStore.js';
import { chatTitle, typingText } from '../lib/chatInfo.js';

function presenceText(presence, now) {
  if (presence.online) return 'online';
  if (presence.lastSeenAt) return formatLastSeen(new Date(presence.lastSeenAt), now);
  return ''; // hidden by privacy, or not a friend
}

/** "4 members · 2 online" for a group. */
function groupStatus(conversation, online) {
  const members = conversation.group.members;
  const active = members.filter((member) => online.has(member.id)).length;
  return `${members.length} members${active ? ` · ${active} online` : ''}`;
}

/**
 * Chat title bar: the friend (with online / last seen) or the group (with its member count).
 * Tapping the name opens the chat's options / group info.
 * @param {{ conversation: object, currentUserId: string, typingIds?: string[],
 *   showBack: boolean, onOpenOptions?: () => void }} props
 */
export function ChatHeader({
  conversation,
  currentUserId,
  typingIds = [],
  showBack,
  onOpenOptions,
}) {
  const presence = usePresence(conversation.peer?.id);
  const online = useOnlineIds();
  const now = useNow();
  const title = chatTitle(conversation);
  const typing = typingIds.length > 0;
  const status = typing
    ? typingText(conversation, typingIds, currentUserId)
    : title.isGroup
      ? groupStatus(conversation, online)
      : presenceText(presence, now);

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
      {/* Tapping the name also opens the options (keyboard users have the ⋮ button). */}
      <div
        onClick={onOpenOptions}
        className={
          onOpenOptions
            ? 'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg py-1 hover:bg-surface-hover'
            : 'flex min-w-0 flex-1 items-center gap-2 py-1'
        }
      >
        <Avatar name={title.name} src={title.avatar} online={Boolean(presence.online)} size="sm" />
        <div className="min-w-0 flex-1 pl-1">
          <h1 className="truncate text-[15px] font-semibold text-text">{title.name}</h1>
          <p
            aria-live="polite"
            className={typing ? 'truncate text-xs text-link' : 'truncate text-xs text-muted'}
          >
            {status}
          </p>
        </div>
      </div>
      {onOpenOptions && (
        <IconButton label={title.isGroup ? 'Group info' : 'Chat options'} onClick={onOpenOptions}>
          <EllipsisVertical aria-hidden="true" className="size-5" />
        </IconButton>
      )}
    </header>
  );
}
