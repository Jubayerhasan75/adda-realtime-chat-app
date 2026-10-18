import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationList } from './ConversationList.jsx';

const conversation = (id, displayName, extra = {}) => ({
  id,
  peer: { id: `u-${id}`, displayName, username: displayName.toLowerCase(), avatar: null },
  unreadCount: 0,
  lastMessage: {
    id: `m-${id}`,
    senderId: `u-${id}`,
    text: `hi from ${displayName}`,
    createdAt: new Date().toISOString(),
  },
  ...extra,
});

function renderList(
  conversations,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConversationList conversations={conversations} currentUserId="me" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const names = () =>
  within(screen.getByRole('navigation', { name: 'Conversations' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

function jsonResponse(body) {
  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ConversationList', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the server’s most-recent-first order', () => {
    renderList([conversation('a', 'Newest'), conversation('b', 'Older')]);

    expect(names()[0]).toContain('Newest');
    expect(names()[1]).toContain('Older');
  });

  it('filters by display name or username and shows a no-results state', async () => {
    renderList([conversation('a', 'Nadia'), conversation('b', 'Arif')]);

    await userEvent.type(screen.getByLabelText('Search chats and messages'), 'nad');
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Nadia');

    await userEvent.clear(screen.getByLabelText('Search chats and messages'));
    await userEvent.type(screen.getByLabelText('Search chats and messages'), 'zzz');
    expect(screen.getByText('No matching chats')).toBeInTheDocument();
  });

  it('copes with a deleted account (no username)', async () => {
    renderList([
      conversation('a', 'Deleted account', {
        peer: { id: 'x', displayName: 'Deleted account', username: null },
      }),
    ]);

    await userEvent.type(screen.getByLabelText('Search chats and messages'), 'del');
    expect(names()[0]).toContain('Deleted account');
  });

  it('welcomes a new account and offers to find friends when there are none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([])),
    );
    renderList([]);

    expect(await screen.findByRole('heading', { name: 'Welcome to Adda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find friends' })).toBeInTheDocument();
  });

  it('with friends but no chats yet, lists them so one tap starts a chat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([{ user: { id: 'u1', displayName: 'Arif', username: 'arif', avatar: null } }]),
      ),
    );
    renderList([]);

    expect(await screen.findByRole('heading', { name: 'Start a chat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arif/ })).toBeInTheDocument();
  });

  it('caps large unread counts at 99+ and prefixes my own last message', () => {
    renderList([
      conversation('a', 'Busy', { unreadCount: 100 }),
      conversation('b', 'Mine', {
        lastMessage: {
          id: 'm',
          senderId: 'me',
          text: 'see you',
          createdAt: new Date().toISOString(),
        },
      }),
    ]);

    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.getByText('You: see you')).toBeInTheDocument();
  });

  it('also searches decrypted messages on this device and highlights the matching words', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['messages', 'a'], {
      pages: [
        {
          messages: [
            {
              id: 'm0',
              conversationId: 'a',
              text: 'nothing here',
              createdAt: '2026-10-17T09:00:00Z',
            },
            {
              id: 'm1',
              conversationId: 'a',
              text: 'see you at the Library',
              createdAt: '2026-10-17T10:00:00Z',
            },
          ],
        },
      ],
      pageParams: [undefined],
    });
    renderList([conversation('a', 'Nadia')], queryClient);

    await userEvent.type(screen.getByLabelText('Search chats and messages'), 'library');

    const result = await screen.findByRole('link', { name: /see you at the library/i });
    expect(result).toHaveAttribute('href', '/chats/a?jump=m1');
    expect(within(result).getByText('Library').tagName).toBe('MARK');
    // Nothing was sent to the server: it can't read (or search) encrypted messages.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('long-press opens a read-only preview that never reports the messages as read', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        messages: [
          { id: 'm1', senderId: 'u-a', text: 'secret news', createdAt: new Date().toISOString() },
        ],
        hasMore: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderList([conversation('a', 'Nadia', { unreadCount: 1 })]);

    // Right-click / Shift+F10 / long-press all arrive as a contextmenu event.
    fireEvent.contextMenu(screen.getByRole('link', { name: /Nadia/ }));

    expect(await screen.findByText('secret news')).toBeInTheDocument();
    expect(screen.getByText('Peeking doesn’t mark messages as seen.')).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`);
    expect(urls).toEqual(['GET /api/conversations/a/messages?limit=4']);
  });
});
