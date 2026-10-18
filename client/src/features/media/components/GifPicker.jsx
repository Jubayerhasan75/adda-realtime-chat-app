import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { SearchField } from '../../../components/ui/SearchField.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js';
import { useGifConfig, useGifSearch } from '../gifs.js';

/**
 * GIF search (KLIPY). Shows trending GIFs until something is typed. Choosing one sends it.
 * KLIPY requires the "Search KLIPY" placeholder and "Powered by KLIPY" attribution.
 * @param {{ onSelect: (gif: object) => void }} props
 */
export function GifPicker({ onSelect }) {
  const config = useGifConfig();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 350);
  const results = useGifSearch(config.data, debounced);

  if (config.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </p>
    );
  }
  if (config.isError || !config.data.available) {
    return (
      <p className="text-sm text-muted">
        GIFs aren’t available right now. You can still send photos, videos and emoji.
      </p>
    );
  }

  const gifs = results.data?.pages.flatMap((page) => page.gifs) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <SearchField
        label="Search GIFs"
        placeholder="Search KLIPY"
        value={query}
        onChange={setQuery}
      />
      {results.isError && <Alert tone="error">{results.error.message}</Alert>}
      {results.isPending && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading GIFs…
        </p>
      )}
      {results.isSuccess && gifs.length === 0 && (
        <p className="text-sm text-muted">No GIFs found for “{debounced}”.</p>
      )}
      <ul
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
        aria-label={debounced ? 'GIF results' : 'Trending GIFs'}
      >
        {gifs.map((gif) => (
          <li key={gif.id}>
            <button
              type="button"
              onClick={() => onSelect(gif)}
              className="block w-full overflow-hidden rounded-md bg-surface-muted"
              style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
            >
              <img
                src={gif.previewUrl}
                alt={gif.title || 'GIF'}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      {results.hasNextPage && (
        <Button
          variant="secondary"
          onClick={() => results.fetchNextPage()}
          disabled={results.isFetchingNextPage}
        >
          {results.isFetchingNextPage ? 'Loading…' : 'More GIFs'}
        </Button>
      )}
      <p className="text-center text-xs text-muted">Powered by KLIPY</p>
    </div>
  );
}
