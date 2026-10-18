import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemStatusPage } from './SystemStatusPage.jsx';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemStatusPage />
    </QueryClientProvider>,
  );
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SystemStatusPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the API and database status when the server is ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { data: { status: 'ok', database: 'up' } })),
    );

    renderPage();

    expect(screen.getByText('Checking the server…')).toBeInTheDocument();
    expect(await screen.findByText('Database: up')).toBeInTheDocument();
    expect(screen.getByText('API: ok')).toBeInTheDocument();
  });

  it('shows the error and lets the user retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(503, {
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: { status: 'ok', database: 'up' } }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'SERVICE_UNAVAILABLE: Database is unavailable',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Database: up')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
