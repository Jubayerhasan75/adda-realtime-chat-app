import { MessageCircleQuestion } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { showToast } from '../../../lib/toast.js';
import { usePageActive } from '../../../hooks/usePageActive.js';
import { AttachmentTray } from '../../media/components/AttachmentTray.jsx';
import { MediaViewer } from '../../media/components/MediaViewer.jsx';
import { useAttachmentTray } from '../../media/useAttachmentTray.js';
import {
  flattenHistory,
  reportRead,
  useConversation,
  useEditMessage,
  useMessageHistory,
  useReact,
  useUnreact,
} from '../api.js';
import { ChatHeader } from '../components/ChatHeader.jsx';
import { ChatOptionsDialog } from '../components/ChatOptionsDialog.jsx';
import { ChatSearchBar } from '../components/ChatSearchBar.jsx';
import { Composer } from '../components/Composer.jsx';
import { MediaLinksDialog } from '../components/MediaLinksDialog.jsx';
import { MessageActionsDialog } from '../components/MessageActionsDialog.jsx';
import { MessageList } from '../components/MessageList.jsx';
import { PinnedBar } from '../components/PinnedBar.jsx';
import { TypingIndicator } from '../components/TypingIndicator.jsx';
import { deliveryStatus } from '../lib/deliveryStatus.js';
import { messageSummary } from '../lib/messageSummary.js';
import { discardMessage, enqueueMessage, retryMessage, useOutbox } from '../outbox.js';
import { chatTitle, nameOf } from '../lib/chatInfo.js';
import { accentStyle } from '../lib/chatTheme.js';
import { useWallpaper } from '../wallpaper.js';
import { createTypingNotifier, useTypingUsers } from '../typingStore.js';

const READ_DEBOUNCE_MS = 500;
const FLASH_MS = 1600;

function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center bg-chat-bg">
      <EmptyState
        icon={<MessageCircleQuestion aria-hidden="true" className="size-6" />}
        title="Conversation not found"
        description="It may have been removed, or you don’t have access to it."
        action={
          <Link to="/chats" className="text-sm font-medium text-link underline underline-offset-4">
            Back to chats
          </Link>
        }
      />
    </div>
  );
}

/** Stored messages (with ticks for mine) followed by my not-yet-confirmed ones. */
function useVisibleMessages(history, pending, memberStates, currentUserId) {
  return useMemo(() => {
    const stored = flattenHistory(history.data).map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt),
      status:
        message.senderId === currentUserId && message.type !== 'system'
          ? deliveryStatus(message, memberStates)
          : undefined,
    }));
    const storedClientIds = new Set(stored.map((m) => m.clientMessageId));
    const unsent = pending
      .filter((item) => !storedClientIds.has(item.clientMessageId))
      .map((item) => ({
        id: item.clientMessageId,
        clientMessageId: item.clientMessageId,
        senderId: currentUserId,
        type: item.gif ? 'gif' : item.attachments?.length ? 'media' : 'text',
        text: item.text || null,
        attachments: item.attachments ?? [],
        gif: item.gif ?? null,
        createdAt: new Date(item.createdAt),
        status: item.status === 'failed' ? 'failed' : 'sending',
        error: item.error,
        pending: true,
      }));
    return [...stored, ...unsent];
  }, [history.data, pending, memberStates, currentUserId]);
}

/**
 * Scrolls a message into view and flashes it, loading older pages until it is found
 * (search results, reply quotes, pins, `?jump=` links).
 */
function useJumpToMessage({ messages, hasNextPage, isFetchingNextPage, fetchNextPage }) {
  const target = useRef(null);
  const [request, setRequest] = useState(0);

  const jumpTo = useCallback((messageId) => {
    target.current = messageId;
    setRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    const messageId = target.current;
    if (!messageId) return;
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      target.current = null;
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      element.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      element.dataset.flash = 'true';
      setTimeout(() => delete element.dataset.flash, FLASH_MS);
    } else if (hasNextPage) {
      if (!isFetchingNextPage) fetchNextPage();
    } else {
      target.current = null;
      showToast('That message isn’t available any more');
    }
  }, [request, messages.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return jumpTo;
}

/** Remounted per conversation so scroll position, unread divider and typing state never leak. */
export function ChatScreen() {
  const { conversationId } = useParams();
  return <ChatView key={conversationId} conversationId={conversationId} />;
}

function ChatView({ conversationId }) {
  const { isDesktop, currentUserId } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [atBottom, setAtBottom] = useState(true);
  const [menu, setMenu] = useState(null);
  const [options, setOptions] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [mediaLinks, setMediaLinks] = useState(false);
  const tray = useAttachmentTray(conversationId);
  const pageActive = usePageActive();
  const wallpaper = useWallpaper(currentUserId, conversationId);

  const conversation = useConversation(conversationId);
  const history = useMessageHistory(conversationId);
  const pending = useOutbox(conversationId);
  const typingIds = useTypingUsers(conversationId);
  const typing = typingIds.length > 0;
  const editMessage = useEditMessage();
  const react = useReact();
  const unreact = useUnreact();
  const typingNotifier = useMemo(() => createTypingNotifier(conversationId), [conversationId]);
  useEffect(() => typingNotifier.stop, [typingNotifier]);

  const data = conversation.data;
  const messages = useVisibleMessages(history, pending, data?.memberStates, currentUserId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const jumpTo = useJumpToMessage({ messages, hasNextPage, isFetchingNextPage, fetchNextPage });

  // The unread divider is placed once, where unread messages began when the chat was opened,
  // and then stays put while they are read. Set during render (React's "store information
  // from previous renders" pattern) so the very first screen already shows it.
  const [firstUnreadId, setFirstUnreadId] = useState(undefined);
  if (firstUnreadId === undefined && data && history.data) {
    setFirstUnreadId(
      messages.find(
        (m) =>
          m.senderId !== currentUserId && m.type !== 'system' && m.seq > data.myState.readUpToSeq,
      )?.id ?? null,
    );
  }

  // Opened from a search result elsewhere (`?jump=<messageId>`).
  const jumpParam = searchParams.get('jump');
  const historyLoaded = Boolean(history.data);
  useEffect(() => {
    if (!jumpParam || !historyLoaded) return;
    jumpTo(jumpParam);
    setSearchParams({}, { replace: true });
  }, [jumpParam, historyLoaded, jumpTo, setSearchParams]);

  // "Seen" only while the chat is open, the page is visible and focused, and the newest
  // messages are on screen.
  const lastPeerSeq = messages.findLast((m) => m.senderId !== currentUserId && m.seq)?.seq ?? 0;
  const readUpToSeq = data?.myState.readUpToSeq ?? 0;
  useEffect(() => {
    if (!pageActive || !atBottom || lastPeerSeq <= readUpToSeq) return undefined;
    const timer = setTimeout(() => reportRead(conversationId, lastPeerSeq), READ_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [conversationId, pageActive, atBottom, lastPeerSeq, readUpToSeq]);

  if (conversation.isError) {
    return conversation.error.status === 404 ? (
      <NotFound />
    ) : (
      <div className="flex flex-1 items-center justify-center p-6">
        <Alert tone="error">
          {conversation.error.message}{' '}
          <button type="button" className="underline" onClick={() => conversation.refetch()}>
            Try again
          </button>
        </Alert>
      </div>
    );
  }
  if (!data || history.isPending) {
    return (
      <div
        role="status"
        className="flex flex-1 items-center justify-center gap-2 bg-chat-bg text-muted"
      >
        <Spinner /> Loading conversation…
      </div>
    );
  }

  const peerName = chatTitle(data).name;
  const isGroup = Boolean(data.group);
  const send = (text) => {
    if (editing) {
      editMessage.mutate(
        { message: editing, text },
        { onError: (error) => showToast(error.message) },
      );
      setEditing(null);
      return;
    }
    enqueueMessage(conversationId, text, { replyToId: replyTo?.id, attachments: tray.take() });
    setReplyTo(null);
  };
  const sendGif = (gif) => {
    enqueueMessage(conversationId, '', { replyToId: replyTo?.id, gif });
    setReplyTo(null);
  };
  const composerContext = editing
    ? { kind: 'edit', title: 'Editing message', text: editing.text }
    : replyTo
      ? {
          kind: 'reply',
          title: `Replying to ${nameOf(data, replyTo.senderId, currentUserId, { you: 'yourself' })}`,
          text: messageSummary(replyTo),
        }
      : null;
  const toggleReaction = (message, emoji, mine) => {
    if (!data.canMessage) return;
    const options = { onError: (error) => showToast(error.message) };
    if (mine) unreact.mutate(message.id, options);
    else react.mutate({ id: message.id, emoji }, options);
  };

  return (
    <section
      aria-label={isGroup ? peerName : `Chat with ${peerName}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      // A chat's own color only changes this chat (and only for me).
      style={accentStyle(data.myState.accent)}
    >
      <ChatHeader
        conversation={data}
        currentUserId={currentUserId}
        typingIds={typingIds}
        showBack={!isDesktop}
        onOpenOptions={() => setOptions({ openedAt: Date.now() })}
      />
      {searching ? (
        <ChatSearchBar
          conversationId={conversationId}
          onQueryChange={setSearchQuery}
          onJumpTo={jumpTo}
          onClose={() => {
            setSearching(false);
            setSearchQuery('');
          }}
        />
      ) : (
        <PinnedBar conversationId={conversationId} onJumpTo={jumpTo} />
      )}
      {history.isError && (
        <Alert tone="error" className="m-3">
          Couldn’t load messages.{' '}
          <button type="button" className="underline" onClick={() => history.refetch()}>
            Try again
          </button>
        </Alert>
      )}
      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        peerName={peerName}
        conversation={data}
        wallpaper={wallpaper}
        firstUnreadId={firstUnreadId}
        hasOlder={hasNextPage}
        loadingOlder={isFetchingNextPage}
        onLoadOlder={() => fetchNextPage()}
        onBottomChange={setAtBottom}
        onRetry={retryMessage}
        onDiscard={discardMessage}
        highlightQuery={searching ? searchQuery : ''}
        onOpenMenu={(message) => setMenu({ message, openedAt: Date.now() })}
        onToggleReaction={toggleReaction}
        onJumpTo={jumpTo}
        onOpenMedia={(message, index) =>
          setViewing({ items: message.attachments, startIndex: index })
        }
        onReply={
          data.canMessage
            ? (message) => {
                setEditing(null);
                setReplyTo(message);
              }
            : undefined
        }
        footer={
          typing && (
            <TypingIndicator
              name={isGroup ? nameOf(data, typingIds[0], currentUserId) : peerName}
            />
          )
        }
      />
      {data.canMessage ? (
        <Composer
          key={editing?.id ?? 'compose'}
          initialText={editing?.text ?? ''}
          context={composerContext}
          onCancelContext={() => {
            setEditing(null);
            setReplyTo(null);
          }}
          onSend={send}
          onTyping={typingNotifier.keystroke}
          onStopTyping={typingNotifier.stop}
          onAttachFiles={tray.add}
          onSendGif={sendGif}
          hasAttachments={tray.items.length > 0}
          sendBlocked={tray.busy}
          attachments={
            <AttachmentTray items={tray.items} onRemove={tray.remove} onRetry={tray.retry} />
          }
        />
      ) : (
        <p className="border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-muted">
          You can’t send messages in this chat. Only friends can message each other.
        </p>
      )}

      <MessageActionsDialog
        target={menu}
        currentUserId={currentUserId}
        canMessage={data.canMessage}
        onClose={() => setMenu(null)}
        onReply={(message) => {
          setEditing(null);
          setReplyTo(message);
        }}
        onEdit={(message) => {
          setReplyTo(null);
          setEditing(message);
        }}
      />
      <MediaViewer
        items={viewing?.items ?? null}
        startIndex={viewing?.startIndex ?? 0}
        onClose={() => setViewing(null)}
      />
      <ChatOptionsDialog
        open={Boolean(options)}
        openedAt={options?.openedAt ?? 0}
        conversation={data}
        currentUserId={currentUserId}
        onClose={() => setOptions(null)}
        onSearch={() => setSearching(true)}
        onMediaLinks={() => setMediaLinks(true)}
      />
      <MediaLinksDialog
        open={mediaLinks}
        conversation={data}
        currentUserId={currentUserId}
        onClose={() => setMediaLinks(false)}
        onJumpTo={jumpTo}
      />
    </section>
  );
}
