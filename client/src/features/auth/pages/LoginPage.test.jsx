import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedirectIfSignedIn } from '../guards.jsx';
import { LoginPage } from './LoginPage.jsx';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Routes fake API responses by URL; the session starts signed out. */
function mockApi(loginResponse) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) =>
      url === '/api/auth/session'
        ? jsonResponse(200, { data: { user: null, csrfToken: null } })
        : loginResponse(),
    ),
  );
}

function renderLogin(initialPath = '/login') {
  const router = createMemoryRouter(
    [
      { element: <RedirectIfSignedIn />, children: [{ path: '/login', element: <LoginPage /> }] },
      { path: '*', element: <p>Landed on app</p> },
    ],
    { initialEntries: [initialPath] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('LoginPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates locally and moves focus to the first invalid field', async () => {
    mockApi(() => jsonResponse(500, {}));
    renderLogin();

    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter your email or username')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText('Email or username')).toHaveFocus());
    expect(fetch).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });

  it('shows the server error for wrong credentials', async () => {
    mockApi(() =>
      jsonResponse(401, {
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email/username or password' },
      }),
    );
    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email or username'), 'nadia');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect email/username or password',
    );
  });

  it('goes to the requested in-app page after logging in, never to another site', async () => {
    mockApi(() => jsonResponse(200, { data: { user: { id: '1' }, csrfToken: 't' } }));
    const router = renderLogin('/login?next=//evil.example');

    await userEvent.type(await screen.findByLabelText('Email or username'), 'nadia');
    await userEvent.type(screen.getByLabelText('Password'), 'purple-river-lamp-42');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Landed on app')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/chats');
  });
});

describe('LoginPage redirect after login', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns to the page the user originally asked for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url === '/api/auth/session'
          ? jsonResponse(200, { data: { user: null, csrfToken: null } })
          : jsonResponse(200, { data: { user: { id: '1' }, csrfToken: 't' } }),
      ),
    );
    const router = renderLogin('/login?next=%2Fsettings');

    await userEvent.type(await screen.findByLabelText('Email or username'), 'nadia');
    await userEvent.type(screen.getByLabelText('Password'), 'purple-river-lamp-42');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
  });
});
