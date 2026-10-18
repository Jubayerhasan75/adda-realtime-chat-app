import { useState } from 'react';
import { cn } from '../../../lib/cn.js';
import { EMOJI_CATEGORIES } from '../emojiData.js';
import { loadRecentEmojis, rememberEmoji } from '../recentEmojis.js';

const RECENT = 'Recent';

/**
 * Grid of curated emojis grouped in tabs, with the ones I used recently first. Each emoji is a
 * real button, so it works with touch, mouse and keyboard; screen readers read the emoji itself.
 * Buttons don't take focus on press, so the typing box keeps its cursor while picking.
 * @param {{ onSelect: (emoji: string) => void, className?: string }} props
 */
export function EmojiPicker({ onSelect, className }) {
  const [recent, setRecent] = useState(loadRecentEmojis);
  const categories = recent.length
    ? [{ name: RECENT, emojis: recent }, ...EMOJI_CATEGORIES]
    : EMOJI_CATEGORIES;
  const [category, setCategory] = useState(categories[0].name);
  const current = categories.find((c) => c.name === category) ?? categories[0];
  const keepFocus = (event) => event.preventDefault();

  const choose = (emoji) => {
    onSelect(emoji);
    // Keep the open tab stable: "Recent" only reorders when it isn't being looked at.
    if (category !== RECENT) setRecent(rememberEmoji(emoji));
    else rememberEmoji(emoji);
  };

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <div
        role="tablist"
        aria-label="Emoji categories"
        className="flex shrink-0 gap-1 overflow-x-auto pb-1"
      >
        {categories.map(({ name }) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === current.name}
            onPointerDown={keepFocus}
            onClick={() => setCategory(name)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap',
              name === current.name ? 'bg-primary text-on-primary' : 'bg-surface-muted text-muted',
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-label={current.name}
        className="grid min-h-0 grid-cols-8 content-start gap-1 overflow-y-auto overscroll-contain"
      >
        {current.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onPointerDown={keepFocus}
            onClick={() => choose(emoji)}
            className="flex aspect-square items-center justify-center rounded-md text-2xl hover:bg-surface-hover active:scale-90 active:bg-surface-active"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
