import { ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { formatDayLabel } from '../../../lib/format.js';
import { nameOf, peopleOf, systemText } from '../lib/chatInfo.js';
import { groupMessages } from '../lib/groupMessages.js';
import { DIM_LEVELS, WALLPAPER_PRESETS } from '../wallpaper.js';
import { MessageBubble } from './MessageBubble.jsx';

const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 200;

/** This chat's background (a photo or preset, kept on this device), dimmed for readability. */
function Wallpaper({ wallpaper }) {
  const preset = WALLPAPER_PRESETS.find((p) => p.id === wallpaper.presetId);
  const image = wallpaper.url ? `url("${wallpaper.url}")` : preset?.css;
  if (!image) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: image }} />
      <div
        className="absolute inset-0 bg-chat-bg"
        style={{ opacity: DIM_LEVELS[wallpaper.dim] ?? DIM_LEVELS.medium }}
      />
    </div>
  );
}

/**
 * Scrollable message history (docs/REQUIREMENTS.md §16 "Message list behavior"):
 * - opens at the unread divider when there is one, otherwise at the newest message;
 * - follows new messages only if they are mine or the reader is already at the bottom;
 * - loads older pages near the top and keeps the reader's position while they appear;
 * - stays pinned to the newest message when the space changes (keyboard, emoji panel,
 *   "typing…", photo tray) if the reader was at the bottom;
 * - shows a ↓ button, with the number of new messages, when the reader has scrolled up.
 */
export function MessageList({
  messages,
  currentUserId,
  firstUnreadId,
  footer,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
  onBottomChange,
  onRetry,
  onDiscard,
  peerName,
  conversation,
  wallpaper = null,
  highlightQuery,
  onOpenMenu,
  onToggleReaction,
  onJumpTo,
  onOpenMedia,
  onReply,
}) {
  const scrollRef = useRef(null);
  const unreadRef = useRef(null);
  const isGroup = Boolean(conversation?.group);
  const items = useMemo(
    () => groupMessages(messages, { currentUserId, firstUnreadId }),
    [messages, currentUserId, firstUnreadId],
  );

  const hasScrolledInitially = useRef(false);
  const isNearBottom = useRef(true);
  const heightBeforeOlder = useRef(null);
  const firstMessageId = messages[0]?.id;
  const lastMessageId = messages.at(-1)?.id;
  const lastIsMine = messages.at(-1)?.senderId === currentUserId;
  const contentRef = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const [seenLastId, setSeenLastId] = useState(lastMessageId);

  // Count messages from the other person that arrive while I'm scrolled up (adjusted during
  // render when the newest message changes).
  if (lastMessageId !== seenLastId) {
    setSeenLastId(lastMessageId);
    if (!atBottom && !lastIsMine && seenLastId) setNewWhileAway((count) => count + 1);
  }

  // Messages added at the end after the first screen slide in (sent or received). Worked out
  // while rendering, from the previous list ("adjust state when props change").
  const [previousItems, setPreviousItems] = useState(items);
  const [appearingKeys, setAppearingKeys] = useState(() => new Set());
  if (previousItems !== items) {
    const oldKeys = new Set(previousItems.map((item) => item.key));
    const lastOld = items.findLastIndex((item) => oldKeys.has(item.key));
    setPreviousItems(items);
    setAppearingKeys(
      new Set(
        previousItems.length
          ? items
              .slice(lastOld + 1)
              .filter((item) => item.type === 'message')
              .map((item) => item.key)
          : [],
      ),
    );
  }
  const smoothUntil = useRef(0);

  // Keep the newest message in view when the visible area or the content changes size.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (Date.now() < smoothUntil.current) return; // a smooth scroll is under way
      if (isNearBottom.current) container.scrollTop = container.scrollHeight;
    });
    observer.observe(container);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = () => {
    const container = scrollRef.current;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Older messages were added above: keep what the reader was looking at in place.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || heightBeforeOlder.current === null) return;
    container.scrollTop += container.scrollHeight - heightBeforeOlder.current;
    heightBeforeOlder.current = null;
  }, [firstMessageId]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !lastMessageId) return;

    if (!hasScrolledInitially.current) {
      hasScrolledInitially.current = true;
      container.scrollTop = unreadRef.current
        ? unreadRef.current.offsetTop - container.clientHeight / 3
        : container.scrollHeight;
      return;
    }
    if (lastIsMine || isNearBottom.current) {
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (smooth) smoothUntil.current = Date.now() + 450;
      container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, [lastMessageId, lastIsMine]);

  const handleScroll = (event) => {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
    const nearBottom = scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom !== isNearBottom.current) {
      isNearBottom.current = nearBottom;
      setAtBottom(nearBottom);
      if (nearBottom) setNewWhileAway(0);
      onBottomChange?.(nearBottom);
    }
    if (scrollTop < LOAD_OLDER_PX && hasOlder && !loadingOlder && onLoadOlder) {
      heightBeforeOlder.current = scrollHeight;
      onLoadOlder();
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-chat-bg">
      {wallpaper && <Wallpaper wallpaper={wallpaper} />}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Messages"
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-2 pb-3"
      >
        <div ref={contentRef}>
          {hasOlder && (
            <div className="flex justify-center py-2">
              {loadingOlder ? (
                <span role="status" className="flex items-center gap-2 text-xs text-muted">
                  <Spinner /> Loading older messages…
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    heightBeforeOlder.current = scrollRef.current?.scrollHeight ?? null;
                    onLoadOlder?.();
                  }}
                  className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-link shadow-sm"
                >
                  Load older messages
                </button>
              )}
            </div>
          )}
          {items.map((item) => {
            if (item.type === 'day') {
              return (
                <div key={item.key} className="sticky top-1 z-10 my-3 flex justify-center">
                  <span className="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur">
                    {formatDayLabel(item.date)}
                  </span>
                </div>
              );
            }
            if (item.type === 'unread') {
              return (
                <div
                  key={item.key}
                  ref={unreadRef}
                  className="my-3 flex items-center gap-3 px-4 text-xs font-semibold text-link"
                >
                  <span className="h-px flex-1 bg-current opacity-40" />
                  Unread messages
                  <span className="h-px flex-1 bg-current opacity-40" />
                </div>
              );
            }
            if (item.type === 'system') {
              return (
                <p
                  key={item.key}
                  id={`message-${item.message.id}`}
                  className="mx-6 my-2 text-center text-xs text-muted"
                >
                  {systemText(item.message, conversation, currentUserId)}
                </p>
              );
            }
            const { message } = item;
            const sender =
              isGroup && !item.isOwn ? peopleOf(conversation).get(message.senderId) : null;
            return (
              <MessageBubble
                key={item.key}
                appearing={appearingKeys.has(item.key)}
                message={message}
                isOwn={item.isOwn}
                isFirstInGroup={item.isFirstInGroup}
                isLastInGroup={item.isLastInGroup}
                currentUserId={currentUserId}
                peerName={peerName}
                nameOf={(userId) => nameOf(conversation, userId, currentUserId)}
                sender={
                  isGroup && !item.isOwn
                    ? {
                        name: sender?.displayName ?? 'Former member',
                        avatar: sender?.avatar ?? null,
                      }
                    : null
                }
                highlightQuery={highlightQuery}
                onOpenMenu={onOpenMenu}
                onToggleReaction={onToggleReaction}
                onJumpTo={onJumpTo}
                onOpenMedia={onOpenMedia}
                onReply={onReply}
                onRetry={
                  message.pending && onRetry ? () => onRetry(message.clientMessageId) : undefined
                }
                onDiscard={
                  message.pending && onDiscard
                    ? () => onDiscard(message.clientMessageId)
                    : undefined
                }
              />
            );
          })}
          {footer}
        </div>
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={
            newWhileAway > 0
              ? `${newWhileAway} new messages. Scroll to the newest`
              : 'Scroll to the newest message'
          }
          className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full border border-border bg-surface text-text shadow-md active:scale-90"
        >
          <ChevronDown aria-hidden="true" className="size-5" />
          {newWhileAway > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] leading-5 font-semibold text-on-primary">
              {newWhileAway > 99 ? '99+' : newWhileAway}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
