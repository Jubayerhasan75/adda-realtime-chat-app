import { BellOff } from 'lucide-react';
import { NavLink } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { cn } from '../../../lib/cn.js';
import { formatListTimestamp } from '../../../lib/format.js';
import { useLongPress } from '../../../hooks/useLongPress.js';
import { usePresence } from '../../realtime/presenceStore.js';
import { useIsTyping } from '../typingStore.js';
import { messageSummary } from '../lib/messageSummary.js';

/**
 * Long-press (or right-click / Shift+F10) opens a read-only preview instead of the chat.
 * @param {{ conversation: { id: string, peer: object, unreadCount: number, lastMessage: object | null }, currentUserId: string, onPreview?: (c: object) => void }} props
 */
export function ConversationListItem({ conversation, currentUserId, onPreview }) {
  const { peer, unreadCount, lastMessage } = conversation;
  const typing = useIsTyping(conversation.id);
  const presence = usePresence(peer.id);
  const longPress = useLongPress(() => onPreview?.(conversation));
  const muted = Boolean(conversation.myState?.muted);
  const hasUnread = unreadCount > 0;
  const sentAt = lastMessage ? new Date(lastMessage.createdAt) : null;
  const preview = typing
    ? 'typing…'
    : lastMessage
      ? `${lastMessage.senderId === currentUserId ? 'You: ' : ''}${messageSummary(lastMessage)}`
      : 'No messages yet';

  return (
    <NavLink
      to={`/chats/${conversation.id}`}
      {...(onPreview ? longPress : {})}
      className={({ isActive }) =>
        cn(
          'mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-(--duration-fast) select-none [-webkit-touch-callout:none]',
          isActive ? 'bg-surface-active' : 'hover:bg-surface-hover',
        )
      }
    >
      <Avatar name={peer.displayName} src={peer.avatar} online={Boolean(presence.online)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'truncate text-[15px] text-text',
              hasUnread ? 'font-semibold' : 'font-medium',
            )}
          >
            {peer.displayName}
          </span>
          {sentAt && (
            <time
              dateTime={sentAt.toISOString()}
              className={cn(
                'ml-auto shrink-0 text-xs tabular-nums',
                hasUnread ? 'font-medium text-link' : 'text-subtle',
              )}
            >
              {formatListTimestamp(sentAt)}
            </time>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              typing ? 'text-link' : hasUnread ? 'text-text' : 'text-muted',
            )}
          >
            {preview}
          </p>
          {muted && <BellOff aria-label="Muted" className="size-3.5 shrink-0 text-subtle" />}
          <Badge count={unreadCount} muted={muted} label="unread messages" />
        </div>
      </div>
    </NavLink>
  );
}
