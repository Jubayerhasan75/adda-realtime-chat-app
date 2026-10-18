import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/http.js';
import { SESSION_KEY, useApplySession, useMarkSigningOut, useSetSessionUser } from '../auth/api.js';

const SESSIONS_KEY = ['account', 'sessions'];

export function useUpdateProfile() {
  const setUser = useSetSessionUser();
  return useMutation({
    mutationFn: (changes) => apiRequest('/api/users/me', { method: 'PATCH', body: changes }),
    onSuccess: setUser,
  });
}

export function useChangeUsername() {
  const setUser = useSetSessionUser();
  return useMutation({
    mutationFn: (body) => apiRequest('/api/users/me/username', { method: 'PATCH', body }),
    onSuccess: setUser,
  });
}

const withSettings = (session, settings) =>
  session?.user ? { ...session, user: { ...session.user, settings } } : session;

/** Merges a partial settings patch ({privacy: {lastSeen}}) into the current settings. */
function mergeSettings(settings, patch) {
  const merged = { ...settings };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = value && typeof value === 'object' ? { ...settings?.[key], ...value } : value;
  }
  return merged;
}

/**
 * Saves settings. Switches and choices change on screen immediately; if saving fails they go
 * back to what they were (and the caller shows the error).
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch) => apiRequest('/api/settings', { method: 'PATCH', body: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: SESSION_KEY });
      const previous = queryClient.getQueryData(SESSION_KEY);
      queryClient.setQueryData(SESSION_KEY, (session) =>
        withSettings(session, mergeSettings(session?.user?.settings, patch)),
      );
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(SESSION_KEY, context.previous);
    },
    onSuccess: (settings) =>
      queryClient.setQueryData(SESSION_KEY, (session) => withSettings(session, settings)),
  });
}

export function useChangePassword() {
  const applySession = useApplySession();
  return useMutation({
    mutationFn: (body) => apiRequest('/api/auth/change-password', { method: 'POST', body }),
    onSuccess: applySession, // the server rotated the session and its CSRF token
  });
}

export function useChangeEmail() {
  return useMutation({
    mutationFn: (body) => apiRequest('/api/auth/change-email', { method: 'POST', body }),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: ({ signal }) => apiRequest('/api/auth/sessions', { signal }),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId) => apiRequest(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest('/api/auth/sessions', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useDeleteAccount() {
  const applySession = useApplySession();
  const markSigningOut = useMarkSigningOut();
  return useMutation({
    mutationFn: (body) => apiRequest('/api/users/me', { method: 'DELETE', body }),
    onMutate: markSigningOut,
    onSuccess: () => applySession({ user: null, csrfToken: null, signedOut: true }),
  });
}
