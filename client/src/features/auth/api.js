import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, setCsrfToken } from '../../lib/http.js';
import { clearOutbox } from '../chat/outbox.js';
import { forgetDeviceKeys } from '../e2ee/keyring.js';

export const SESSION_KEY = ['session'];

/** Who is logged in. `user` is null when signed out. The result also primes the CSRF token. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }) => {
      const session = await apiRequest('/api/auth/session', { signal });
      setCsrfToken(session.csrfToken);
      return session;
    },
    staleTime: 5 * 60_000,
  });
}

/** Updates the cached session after login, logout or a password change. */
export function useApplySession() {
  const queryClient = useQueryClient();
  return (session) => {
    setCsrfToken(session.csrfToken);
    if (!session.user) {
      // Forget everything that belonged to the previous user, including unsent messages and
      // the unlocked encryption keys stored on this device.
      clearOutbox();
      forgetDeviceKeys();
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
    }
    queryClient.setQueryData(SESSION_KEY, session);
  };
}

/** Replaces the user object inside the cached session (e.g. after a profile edit). */
export function useSetSessionUser() {
  const queryClient = useQueryClient();
  return (user) =>
    queryClient.setQueryData(SESSION_KEY, (session) => (session ? { ...session, user } : session));
}

export function useLogin() {
  const applySession = useApplySession();
  return useMutation({
    mutationFn: (credentials) =>
      apiRequest('/api/auth/login', { method: 'POST', body: credentials }),
    onSuccess: applySession,
  });
}

/**
 * Flags the cached session as "signing out" so the live connection, which the server closes as
 * part of logging out, isn't mistaken for a session that ended somewhere else.
 */
export function useMarkSigningOut() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.setQueryData(SESSION_KEY, (session) =>
      session ? { ...session, signingOut: true } : session,
    );
}

export function useLogout() {
  const applySession = useApplySession();
  const markSigningOut = useMarkSigningOut();
  return useMutation({
    mutationFn: () => apiRequest('/api/auth/logout', { method: 'POST' }),
    onMutate: markSigningOut,
    // Even if the request fails (e.g. offline), forget the session locally.
    // `signedOut` marks a deliberate logout, so the guards don't offer to return to this page.
    onSettled: () => applySession({ user: null, csrfToken: null, signedOut: true }),
  });
}

/** Simple POST mutation for the auth endpoints that return `{ message }`. */
export function useAuthAction(path) {
  return useMutation({
    mutationFn: (body) => apiRequest(`/api/auth/${path}`, { method: 'POST', body }),
  });
}
