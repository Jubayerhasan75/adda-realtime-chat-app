import { Pin } from 'lucide-react';
import { useState } from 'react';
import { usePins } from '../api.js';
import { messageSummary } from '../lib/messageSummary.js';

/**
 * Pinned messages strip under the chat header. Tapping it jumps to the shown pin and moves on
 * to the next one, so repeated taps walk through all pins (newest first).
 */
export function PinnedBar({ conversationId, onJumpTo }) {
  const pins = usePins(conversationId);
  const [index, setIndex] = useState(0);
  const list = pins.data ?? [];
  if (list.length === 0) return null;

  const current = list[index % list.length];
  return (
    <button
      type="button"
      onClick={() => {
        onJumpTo(current.id);
        setIndex((i) => (i + 1) % list.length);
      }}
      className="flex w-full shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2 text-left hover:bg-surface-hover"
    >
      <Pin aria-hidden="true" className="size-4 shrink-0 text-link" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-link">
          Pinned message{list.length > 1 ? ` ${(index % list.length) + 1} of ${list.length}` : ''}
        </span>
        <span className="block truncate text-sm text-text">{messageSummary(current)}</span>
      </span>
    </button>
  );
}
