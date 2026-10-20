import { Fragment } from 'react';
import { Ban, Lock, MoreHorizontal, Pin, Reply } from 'lucide-react';
import { useLongPress } from '../../../hooks/useLongPress.js';
import { mergeHandlers, useSwipeToReply } from '../../../hooks/useSwipeToReply.js';
import { cn } from '../../../lib/cn.js';
import { formatTime } from '../../../lib/format.js';
import { highlightText } from '../../../lib/highlight.jsx';
import { splitLinks } from '../../../lib/links.js';
import { GifImage, MediaGrid } from '../../media/components/MediaGrid.jsx';
import { messageSummary } from '../lib/messageSummary.js';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { MessageStatus } from './MessageStatus.jsx';

/** Reaction chips under a bubble: one per emoji with a count; tapping toggles my reaction. */
function Reactions({ reactions, currentUserId, onToggle, isOwn, indented }) {
  const groups = new Map();
  for (const { emoji, userId } of reactions) {
    const group = groups.get(emoji) ?? { emoji, count: 0, mine: false };
    group.count += 1;
    group.mine ||= userId === currentUserId;
    groups.set(emoji, group);
  }
  return (
    <div
      className={cn('-mt-1.5 flex gap-1', isOwn ? 'mr-2 justify-end' : indented ? 'ml-12' : 'ml-2')}
    >
      {[...groups.values()].map(({ emoji, count, mine }) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle?.(emoji, mine)}
          aria-pressed={mine}
          aria-label={`${emoji} ${count}${mine ? ', including you. Tap to remove' : ''}`}
          className={cn(
            'relative flex items-center gap-0.5 rounded-full border bg-surface px-1.5 py-0.5 text-sm shadow-sm',
            mine ? 'border-primary' : 'border-border',
          )}
        >
          {emoji}
          {count > 1 && <span className="text-xs text-muted">{count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Message text with tappable web links (opened in a new tab, without telling the site where from). */
function MessageText({ text, query, isOwn }) {
  return splitLinks(text).map((part, index) =>
    part.href ? (
      <a
        key={index}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={cn(
          'underline underline-offset-2 [overflow-wrap:anywhere]',
          isOwn ? 'text-on-bubble-out' : 'text-link',
        )}
      >
        {highlightText(part.text, query)}
      </a>
    ) : (
      <Fragment key={index}>{highlightText(part.text, query)}</Fragment>
    ),
  );
}

/** Quoted original inside a reply; tapping it jumps to the original message. */
function ReplyQuote({ replyTo, authorName, isOwn, onJump }) {
  return (
    <button
      type="button"
      onClick={() => onJump?.(replyTo.id)}
      className={cn(
        'mb-1 block w-full rounded-md border-l-4 px-2 py-1 text-left text-xs',
        isOwn ? 'border-on-bubble-out/60 bg-black/15' : 'border-primary bg-surface-muted',
      )}
    >
      <span className="block font-semibold">{authorName}</span>
      <span className={cn('line-clamp-2', replyTo.unsent && 'italic opacity-80')}>
        {messageSummary(replyTo)}
      </span>
    </button>
  );
}

/**
 * One message. Corner rounding follows its position in a sender group. Long-press (touch),
 * right-click or the ⋯ button opens the actions; unsent messages keep a placeholder.
 *
 * @param {{
 *   message: object, isOwn: boolean, isFirstInGroup: boolean, isLastInGroup: boolean,
 *   currentUserId?: string, peerName?: string, highlightQuery?: string,
 *   onRetry?: () => void, onDiscard?: () => void, onOpenMenu?: (message: object) => void,
 *   onToggleReaction?: (message: object, emoji: string, mine: boolean) => void,
 *   onJumpTo?: (messageId: string) => void,
 *   onOpenMedia?: (message: object, index: number) => void,
 * }} props
 */
export function MessageBubble({
  message,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  currentUserId,
  peerName = 'Them',
  nameOf,
  sender = null,
  highlightQuery = '',
  onRetry,
  onDiscard,
  onOpenMenu,
  onToggleReaction,
  onJumpTo,
  onOpenMedia,
  onReply,
  appearing = false,
}) {
  const failed = message.status === 'failed';
  const unsent = Boolean(message.unsentAt);
  const canOpenMenu = Boolean(onOpenMenu) && !message.pending;
  const longPress = useLongPress(() => onOpenMenu?.(message));
  const swipe = useSwipeToReply({
    direction: isOwn ? -1 : 1,
    enabled: Boolean(onReply) && !message.pending && !message.unsentAt && !message.undecryptable,
    onReply: () => onReply?.(message),
  });
  const replyAuthor =
    message.replyTo?.senderId === currentUserId
      ? 'You'
      : (nameOf?.(message.replyTo?.senderId) ?? peerName);
  const attachments = unsent ? [] : (message.attachments ?? []);
  const gif = unsent ? null : message.gif;
  const hasMedia = attachments.length > 0 || Boolean(gif);

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        'group flex flex-col px-3 sm:px-4',
        appearing && (isOwn ? 'animate-message-in-own' : 'animate-message-in'),
        isOwn ? 'items-end' : 'items-start',
        isFirstInGroup ? 'mt-2' : 'mt-0.5',
      )}
    >
      {/* Groups: the sender's name above their first bubble, like Messenger. */}
      {sender && isFirstInGroup && (
        <span className="mb-0.5 ml-12 text-xs font-medium text-muted">{sender.name}</span>
      )}
      <div
        className={cn(
          'relative flex max-w-full items-center gap-1',
          isOwn && 'flex-row-reverse',
          !swipe.dragging && 'transition-transform duration-(--duration-fast)',
        )}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        {swipe.offset !== 0 && (
          <span
            aria-hidden="true"
            style={{ opacity: Math.min(1, Math.abs(swipe.offset) / 56) }}
            className={cn(
              'absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-muted shadow-sm transition-colors',
              isOwn ? '-right-11' : '-left-11',
              swipe.ready && 'bg-primary text-on-primary',
            )}
          >
            <Reply className="size-4" />
          </span>
        )}
        {sender && (
          <span className="mr-1 flex w-8 shrink-0 self-end">
            {isLastInGroup && <Avatar name={sender.name} src={sender.avatar} size="sm" />}
          </span>
        )}
        <div
          {...mergeHandlers(canOpenMenu ? longPress : {}, swipe.handlers)}
          className={cn(
            'relative max-w-[min(80vw,34rem)] touch-pan-y rounded-bubble shadow-sm select-text [-webkit-touch-callout:none]',
            hasMedia ? 'p-1 pb-1' : 'px-3 pt-1.5 pb-1',
            'transition-shadow duration-(--duration-slow) [[data-flash=true]_&]:ring-4 [[data-flash=true]_&]:ring-primary',
            isOwn ? 'bg-bubble-out text-on-bubble-out' : 'bg-bubble-in text-on-bubble-in',
            isOwn && !isFirstInGroup && 'rounded-tr-md',
            isOwn && !isLastInGroup && 'rounded-br-md',
            isOwn && isLastInGroup && 'rounded-br-sm',
            !isOwn && !isFirstInGroup && 'rounded-tl-md',
            !isOwn && !isLastInGroup && 'rounded-bl-md',
            !isOwn && isLastInGroup && 'rounded-bl-sm',
            failed && 'opacity-70',
          )}
        >
          {message.replyTo && (
            <ReplyQuote
              replyTo={message.replyTo}
              authorName={replyAuthor}
              isOwn={isOwn}
              onJump={onJumpTo}
            />
          )}
          {message.undecryptable && !unsent ? (
            <p className="flex items-center gap-1.5 text-[15px] italic opacity-80">
              <Lock aria-hidden="true" className="size-4" />
              Can’t be decrypted on this device
            </p>
          ) : unsent ? (
            <p className="flex items-center gap-1.5 text-[15px] italic opacity-80">
              <Ban aria-hidden="true" className="size-4" />
              {isOwn ? 'You unsent a message' : 'This message was unsent'}
            </p>
          ) : (
            <>
              {attachments.length > 0 && (
                <MediaGrid
                  attachments={attachments}
                  onOpen={(index) => onOpenMedia?.(message, index)}
                />
              )}
              {gif && <GifImage gif={gif} />}
              {message.text && (
                <p
                  className={cn(
                    'text-[15px] leading-snug break-words whitespace-pre-wrap [overflow-wrap:anywhere]',
                    hasMedia && 'max-w-[min(260px,62vw)] px-2 pt-1',
                  )}
                >
                  <MessageText text={message.text} query={highlightQuery} isOwn={isOwn} />
                </p>
              )}
            </>
          )}
          <span
            className={cn(
              'float-right mt-0.5 ml-3 flex translate-y-0.5 items-center gap-1 text-[11px] tabular-nums',
              hasMedia && 'mr-1.5',
              isOwn ? 'text-on-bubble-out/75' : 'text-muted',
            )}
          >
            {message.pinnedAt && <Pin aria-label="Pinned" className="size-3" />}
            {message.editedAt && !unsent && <span>edited</span>}
            <time dateTime={message.createdAt.toISOString()}>{formatTime(message.createdAt)}</time>
            {isOwn && message.status && !unsent && <MessageStatus status={message.status} />}
          </span>
        </div>
        {canOpenMenu && (
          <button
            type="button"
            onClick={() => onOpenMenu(message)}
            aria-label="Message actions"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-hover pointer-coarse:hidden"
          >
            <MoreHorizontal aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      {!unsent && message.reactions?.length > 0 && (
        <Reactions
          reactions={message.reactions}
          currentUserId={currentUserId}
          isOwn={isOwn}
          indented={Boolean(sender)}
          onToggle={onToggleReaction && ((emoji, mine) => onToggleReaction(message, emoji, mine))}
        />
      )}
      {failed && (
        <div role="alert" className="mt-1 flex items-center gap-3 text-xs">
          <span className="text-danger">{message.error ?? 'Not sent'}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="font-semibold text-link hover:underline"
            >
              Retry
            </button>
          )}
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className="font-semibold text-muted hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
