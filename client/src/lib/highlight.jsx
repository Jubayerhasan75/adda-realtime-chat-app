import { Fragment } from 'react';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wraps every occurrence of the query's words in <mark>, case-insensitively. Builds React nodes
 * (never HTML strings), so message text can't inject markup.
 * @param {string} text
 * @param {string} query
 */
export function highlightText(text, query) {
  const words = query.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
  if (!text || words.length === 0) return text;
  const pattern = new RegExp(`(${words.join('|')})`, 'giu');
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded-sm bg-primary-soft px-0.5 text-inherit ring-1 ring-primary"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
