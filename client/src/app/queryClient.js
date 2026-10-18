import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { SESSION_KEY } from '../features/auth/api.js';
import { setCsrfToken } from '../lib/http.js';

export function createQueryClient() {
  // If any request reports that the session is gone (expired, revoked from another device),
  // mark the user as signed out; the route guards then send them to the login page.
  const onError = (error) => {
    if (error?.code !== 'UNAUTHENTICATED') return;
    setCsrfToken(null);
    // A request that was still running while I logged out isn't an expired session: keep the
    // logout deliberate, so the login page doesn't offer to return to where I was.
    const current = queryClient.getQueryData(SESSION_KEY);
    const signedOut = Boolean(current?.signingOut || current?.signedOut);
    queryClient.setQueryData(SESSION_KEY, { user: null, csrfToken: null, signedOut });
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (4xx) won't succeed on retry; network/5xx errors might.
        retry: (failureCount, error) =>
          failureCount < 2 && !(error?.status >= 400 && error?.status < 500),
      },
    },
  });
  return queryClient;
}
