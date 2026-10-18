import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/http.js';

const KLIPY_API = 'https://api.klipy.com/api/v1';
const PER_PAGE = 24;

/** `{available: false}` or `{available: true, appKey, customerId}` from our server. */
export function useGifConfig(enabled = true) {
  return useQuery({
    queryKey: ['gifs', 'config'],
    queryFn: () => apiRequest('/api/gifs/config'),
    staleTime: Infinity,
    enabled,
  });
}

/** Turns one KLIPY result into what we send and store (docs/API.md §2.10). */
export function toGif(item) {
  const pick = (size) => item.file?.[size]?.webp ?? item.file?.[size]?.gif;
  const main = pick('md') ?? pick('sm') ?? pick('hd');
  const preview = pick('sm') ?? pick('xs') ?? main;
  if (!main?.url || !preview?.url) return null;
  return {
    provider: 'klipy',
    id: String(item.slug ?? item.id),
    title: String(item.title ?? '').slice(0, 200),
    url: main.url,
    previewUrl: preview.url,
    width: main.width,
    height: main.height,
  };
}

/**
 * Trending GIFs (empty query) or search results, page by page, straight from KLIPY (its terms
 * forbid proxying). Results are shown in KLIPY's order; the strictest content filter is used.
 */
export function useGifSearch(config, query) {
  return useInfiniteQuery({
    queryKey: ['gifs', 'search', query],
    enabled: Boolean(config?.available),
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        per_page: String(PER_PAGE),
        customer_id: config.customerId,
        content_filter: 'high',
        format_filter: 'webp,gif',
      });
      if (query) params.set('q', query);
      const endpoint = query ? 'search' : 'trending';
      const response = await fetch(
        `${KLIPY_API}/${encodeURIComponent(config.appKey)}/gifs/${endpoint}?${params}`,
        { signal, credentials: 'omit', referrerPolicy: 'no-referrer' },
      );
      if (!response.ok) throw new Error('GIFs couldn’t be loaded. Please try again.');
      const body = await response.json();
      return {
        gifs: (body?.data?.data ?? []).map(toGif).filter(Boolean),
        hasNext: Boolean(body?.data?.has_next),
        page: pageParam,
      };
    },
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    staleTime: 5 * 60 * 1000,
  });
}
