import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GifPicker } from './GifPicker.jsx';

const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const klipyItem = {
  id: 1,
  slug: 'hello-hi-662',
  title: 'Hello',
  file: {
    md: { webp: { url: 'https://static.klipy.com/ii/a/md.webp', width: 320, height: 240 } },
    sm: { webp: { url: 'https://static.klipy.com/ii/a/sm.webp', width: 160, height: 120 } },
  },
};

function renderPicker(config, onSelect = vi.fn()) {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).startsWith('/api/gifs/config')) return json({ data: config });
    return json({ result: true, data: { data: [klipyItem], has_next: false, current_page: 1 } });
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GifPicker onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return { fetchMock, onSelect };
}

describe('GifPicker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says GIFs are unavailable when no provider key is configured', async () => {
    renderPicker({ available: false });
    expect(await screen.findByText(/GIFs aren’t available/)).toBeInTheDocument();
  });

  it('loads trending GIFs straight from KLIPY, with the required attribution, and sends one', async () => {
    const { fetchMock, onSelect } = renderPicker({
      available: true,
      provider: 'klipy',
      appKey: 'app-key',
      customerId: 'anon123',
    });

    expect(await screen.findByPlaceholderText('Search KLIPY')).toBeInTheDocument();
    expect(screen.getByText('Powered by KLIPY')).toBeInTheDocument();
    const preview = await screen.findByRole('img', { name: 'Hello' });
    expect(preview).toHaveAttribute('src', 'https://static.klipy.com/ii/a/sm.webp');

    const klipyCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((u) => u.includes('klipy'));
    expect(klipyCall).toMatch(/^https:\/\/api\.klipy\.com\/api\/v1\/app-key\/gifs\/trending\?/);
    expect(klipyCall).toContain('customer_id=anon123');
    expect(klipyCall).toContain('content_filter=high');

    await userEvent.click(preview);
    expect(onSelect).toHaveBeenCalledWith({
      provider: 'klipy',
      id: 'hello-hi-662',
      title: 'Hello',
      url: 'https://static.klipy.com/ii/a/md.webp',
      previewUrl: 'https://static.klipy.com/ii/a/sm.webp',
      width: 320,
      height: 240,
    });
  });
});
