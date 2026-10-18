import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { SearchField } from '../../../components/ui/SearchField.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js';
import { formatListTimestamp } from '../../../lib/format.js';
import { highlightText } from '../../../lib/highlight.jsx';
import { useMessageSearch } from '../api.js';
import { ChatsWelcome } from './ChatsWelcome.jsx';
import { ConversationListItem } from './ConversationListItem.jsx';
import { ConversationPreviewDialog } from './ConversationPreviewDialog.jsx';

/** Messages matching the search across all my chats; each opens the chat at that message. */
function MessageResults({ query, conversations }) {
  const search = useMessageSearch(query);
  if (query.length < 2) return null;

  const peerName = (conversationId) =>
    conversations.find((c) => c.id === conversationId)?.peer.displayName ?? 'Chat';

  return (
    <section aria-label="Messages" className="mt-2">
      <h2 className="px-4 py-1 text-xs font-semibold tracking-wide text-muted uppercase">
        Messages
      </h2>
      {search.isPending && (
        <p role="status" className="flex items-center gap-2 px-4 py-2 text-sm text-muted">
          <Spinner /> Searching messages…
        </p>
      )}
      {search.isError && <p className="px-4 py-2 text-sm text-danger">{search.error.message}</p>}
      {search.data?.length === 0 && (
        <p className="px-4 py-2 text-sm text-muted">No messages contain all of these words.</p>
      )}
      <ul>
        {search.data?.map((message) => (
          <li key={message.id}>
            <Link
              to={`/chats/${message.conversationId}?jump=${message.id}`}
              className="mx-2 block rounded-lg px-2 py-2 hover:bg-surface-hover"
            >
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium text-text">
                  {peerName(message.conversationId)}
                </span>
                <time className="ml-auto shrink-0 text-xs text-subtle" dateTime={message.createdAt}>
                  {formatListTimestamp(new Date(message.createdAt))}
                </time>
              </span>
              <span className="line-clamp-2 text-sm text-muted">
                {highlightText(message.text, query)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Conversation list (most recent first, as sent by the server). The search box filters chats by
 * name and, from 2 characters, also searches message text in all chats. Long-press a chat to
 * peek without marking it as seen.
 */
export function ConversationList({ conversations, currentUserId, status }) {
  const [filter, setFilter] = useState('');
  const [previewing, setPreviewing] = useState(null);
  const query = filter.trim().toLocaleLowerCase();
  const messageQuery = useDebouncedValue(filter.trim(), 300);

  const visible = conversations.filter(
    ({ peer }) =>
      !query ||
      peer.displayName.toLocaleLowerCase().includes(query) ||
      (peer.username ?? '').includes(query),
  );

  return (
    <section aria-labelledby="chats-heading" className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <h1 id="chats-heading" className="mb-3 text-xl font-bold tracking-tight text-text">
          Chats
        </h1>
        <SearchField
          label="Search chats and messages"
          placeholder="Search"
          value={filter}
          onChange={setFilter}
        />
      </header>
      <nav
        aria-label="Conversations"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
      >
        {status}
        {visible.length > 0 && (
          <ul className="space-y-0.5">
            {visible.map((conversation) => (
              <li key={conversation.id}>
                <ConversationListItem
                  conversation={conversation}
                  currentUserId={currentUserId}
                  onPreview={setPreviewing}
                />
              </li>
            ))}
          </ul>
        )}
        {query && visible.length === 0 && messageQuery.length < 2 && (
          <EmptyState
            icon={<SearchX aria-hidden="true" className="size-6" />}
            title="No matching chats"
            description={`Nothing matches “${filter.trim()}”.`}
          />
        )}
        {query && <MessageResults query={messageQuery} conversations={conversations} />}
        {!query && visible.length === 0 && !status && <ChatsWelcome />}
      </nav>
      <ConversationPreviewDialog
        conversation={previewing}
        currentUserId={currentUserId}
        onClose={() => setPreviewing(null)}
      />
    </section>
  );
}
