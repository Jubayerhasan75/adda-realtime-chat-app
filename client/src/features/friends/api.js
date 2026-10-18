import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/http.js';

/** Everything under ['people'] is refetched when a friendship changes (live or locally). */
export const FRIENDS_KEYS = {
  all: ['people'],
  friends: ['people', 'friends'],
  requests: (direction) => ['people', 'requests', direction],
  blocked: ['people', 'blocked'],
  search: (q) => ['people', 'search', q],
  profile: (username) => ['people', 'profile', username],
};

export function useFriends() {
  return useQuery({
    queryKey: FRIENDS_KEYS.friends,
    queryFn: ({ signal }) => apiRequest('/api/friends', { signal }),
  });
}

export function useFriendRequests(direction) {
  return useQuery({
    queryKey: FRIENDS_KEYS.requests(direction),
    queryFn: ({ signal }) => apiRequest(`/api/friends/requests?direction=${direction}`, { signal }),
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: FRIENDS_KEYS.blocked,
    queryFn: ({ signal }) => apiRequest('/api/friends/blocks', { signal }),
  });
}

export function useUserSearch(q) {
  return useQuery({
    queryKey: FRIENDS_KEYS.search(q),
    queryFn: ({ signal }) => apiRequest(`/api/users/search?q=${encodeURIComponent(q)}`, { signal }),
    enabled: q.length > 0,
    staleTime: 10_000,
  });
}

export function useProfile(username) {
  return useQuery({
    queryKey: FRIENDS_KEYS.profile(username),
    queryFn: ({ signal }) => apiRequest(`/api/users/${encodeURIComponent(username)}`, { signal }),
    enabled: Boolean(username),
  });
}

/** A mutation that refreshes all people-related lists afterwards. */
function usePeopleMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: FRIENDS_KEYS.all }),
  });
}

export const useSendFriendRequest = () =>
  usePeopleMutation((userId) =>
    apiRequest('/api/friends/requests', { method: 'POST', body: { userId } }),
  );
export const useAcceptRequest = () =>
  usePeopleMutation((requestId) =>
    apiRequest(`/api/friends/requests/${requestId}/accept`, { method: 'POST' }),
  );
export const useDeclineRequest = () =>
  usePeopleMutation((requestId) =>
    apiRequest(`/api/friends/requests/${requestId}/decline`, { method: 'POST' }),
  );
export const useCancelRequest = () =>
  usePeopleMutation((requestId) =>
    apiRequest(`/api/friends/requests/${requestId}`, { method: 'DELETE' }),
  );
export const useRemoveFriend = () =>
  usePeopleMutation((userId) => apiRequest(`/api/friends/${userId}`, { method: 'DELETE' }));
export const useBlockUser = () =>
  usePeopleMutation((userId) =>
    apiRequest('/api/friends/blocks', { method: 'POST', body: { userId } }),
  );
export const useUnblockUser = () =>
  usePeopleMutation((userId) => apiRequest(`/api/friends/blocks/${userId}`, { method: 'DELETE' }));

export function useReportUser() {
  return useMutation({
    mutationFn: ({ userId, ...body }) =>
      apiRequest(`/api/users/${userId}/report`, { method: 'POST', body }),
  });
}
