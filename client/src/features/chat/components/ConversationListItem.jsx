import { BellOff } from 'lucide-react';
import { NavLink } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { cn } from '../../../lib/cn.js';
import { formatListTimestamp } from '../../../lib/format.js';
import { useLongPress } from '../../../hooks/useLongPress.js';
import { usePresence } from '../../realtime/presenceStore.js';
import { useTypingUsers } from '../typingStore.js';
import { chatTitle, nameOf, systemText, typingText } from '../lib/chatInfo.js';
import { messageSummary } from '../lib/messageSummary.js';

/** The grey line under the name: who said what last (or the group notice). */
function lastLine(conversation, currentUserId) {
  const { lastMessage } = conversation;
  if (!lastMessage) return 'No messages yet';
  if (lastMessage.type === 'system') return systemText(lastMessage, conversation, currentUserId);
  const mine = lastMessage.senderId === currentUserId;
  const who = mine
    ? 'You: '
    : conversation.group
      ? `${nameOf(conversation, lastMessage.senderId, currentUserId).split(' ')[0]}: `
      : '';
  return `${who}${messageSummary(lastMessage)}`;
}

/**
 * One chat (a friend or a group). Long-press (or right-click / Shift+F10) opens a read-only
 * preview instead of the chat.
 * @param {{ conversation: object, currentUserId: string, onPreview?: (c: object) => void }} props
 */
export function ConversationListItem({ conversation, currentUserId, onPreview }) {
  const { peer, unreadCount, lastMessage } = conversation;
  const title = chatTitle(conversation);
  const typingIds = useTypingUsers(conversation.id);
  const typing = typingIds.length > 0;
  const presence = usePresence(peer?.id);
  const longPress = useLongPress(() => onPreview?.(conversation));
  const muted = Boolean(conversation.myState?.muted);
  const hasUnread = unreadCount > 0;
  const sentAt = lastMessage ? new Date(lastMessage.createdAt) : null;
  const preview = typing
    ? typingText(conversation, typingIds, currentUserId)
    : lastLine(conversation, currentUserId);

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
      <Avatar name={title.name} src={title.avatar} online={Boolean(presence.online)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'truncate text-[15px] text-text',
              hasUnread ? 'font-semibold' : 'font-medium',
            )}
          >
            {title.name}
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
