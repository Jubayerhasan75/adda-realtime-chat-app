import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { SearchField } from '../../../components/ui/SearchField.jsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js';
import { useMessageSearch } from '../api.js';

/**
 * Search inside the open chat: results are walked newest → oldest with ↑/↓ (or Enter /
 * Shift+Enter); each one is scrolled into view and highlighted by the chat.
 * @param {{ conversationId: string, onQueryChange: (q: string) => void, onJumpTo: (id: string) => void, onClose: () => void }} props
 */
export function ChatSearchBar({ conversationId, onQueryChange, onJumpTo, onClose }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [jumped, setJumped] = useState(false);
  const q = useDebouncedValue(query.trim(), 300);
  const search = useMessageSearch(q, conversationId);
  const results = search.data ?? [];

  useEffect(() => {
    onQueryChange(q);
  }, [q, onQueryChange]);

  const go = (nextIndex) => {
    if (results.length === 0) return;
    const wrapped = (nextIndex + results.length) % results.length;
    setIndex(wrapped);
    setJumped(true);
    onJumpTo(results[wrapped].id);
  };

  let status = '';
  if (q.length >= 2) {
    if (search.isPending) status = 'Searching…';
    else if (search.isError) status = search.error.message;
    else status = results.length ? `${index + 1} of ${results.length}` : 'No results';
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-2 py-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'Enter') {
          // First Enter shows the newest match; then Enter = older, Shift+Enter = newer.
          event.preventDefault();
          if (!jumped) go(0);
          else go(event.shiftKey ? index - 1 : index + 1);
        }
      }}
    >
      <SearchField
        className="flex-1"
        label="Search in this chat"
        placeholder="Search in this chat"
        value={query}
        onChange={(value) => {
          setQuery(value);
          setIndex(0);
          setJumped(false);
        }}
      />
      <span role="status" className="min-w-16 text-center text-xs text-muted tabular-nums">
        {status}
      </span>
      <IconButton
        size="sm"
        label="Newer result"
        disabled={!results.length}
        onClick={() => go(index - 1)}
      >
        <ChevronDown aria-hidden="true" className="size-5" />
      </IconButton>
      <IconButton
        size="sm"
        label="Older result"
        disabled={!results.length}
        onClick={() => go(index + 1)}
      >
        <ChevronUp aria-hidden="true" className="size-5" />
      </IconButton>
      <IconButton size="sm" label="Close search" onClick={onClose}>
        <X aria-hidden="true" className="size-5" />
      </IconButton>
    </div>
  );
}
