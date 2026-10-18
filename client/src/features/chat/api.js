import { CLIENT_EVENTS } from '@chat/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/http.js';
import {
  openConversation,
  openMessage,
  openMessages,
  rememberConversation,
  sealContent,
} from '../e2ee/messages.js';
import { getConnectedSocket } from '../realtime/socketStore.js';

export const CHAT_KEYS = {
  /** Prefix: the list and every single conversation. */
  conversations: ['conversations'],
  list: ['conversations', 'list'],
  conversation: (id) => ['conversations', 'one', id],
  /** Prefix for all message histories. */
  messages: ['messages'],
  history: (id) => ['messages', id],
  pins: (id) => ['conversations', 'pins', id],
};

export function useConversations() {
  return useQuery({
    queryKey: CHAT_KEYS.list,
    // Last-message previews are decrypted on this device (docs/E2EE.md).
    queryFn: async ({ signal }) =>
      Promise.all((await apiRequest('/api/conversations', { signal })).map(openConversation)),
  });
}

export function useConversation(conversationId) {
  return useQuery({
    queryKey: CHAT_KEYS.conversation(conversationId),
    queryFn: async ({ signal }) =>
      openConversation(await apiRequest(`/api/conversations/${conversationId}`, { signal })),
  });
}

/** History in pages of 30, newest page first; `fetchNextPage` loads older messages. */
export function useMessageHistory(conversationId) {
  return useInfiniteQuery({
    queryKey: CHAT_KEYS.history(conversationId),
    queryFn: async ({ pageParam, signal }) => {
      const page = await apiRequest(
        `/api/conversations/${conversationId}/messages${pageParam ? `?before=${pageParam}` : ''}`,
        { signal },
      );
      return { ...page, messages: await openMessages(page.messages) };
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages[0]?.seq : undefined),
    staleTime: Infinity, // kept current by live events; refreshed after reconnecting
  });
}

/** All loaded messages of a conversation, oldest first. */
export function flattenHistory(data) {
  return data ? data.pages.toReversed().flatMap((page) => page.messages) : [];
}

/** Adds a message (live event or send acknowledgement) to the cached history, once. */
export function insertMessage(queryClient, message) {
  queryClient.setQueryData(CHAT_KEYS.history(message.conversationId), (data) => {
    if (!data) return data;
    if (data.pages.some((page) => page.messages.some((m) => m.id === message.id))) return data;
    const [newest, ...older] = data.pages;
    const messages = [...newest.messages, message].sort((a, b) => a.seq - b.seq);
    return { ...data, pages: [{ ...newest, messages }, ...older] };
  });
}

export function useOpenConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (peerUserId) =>
      apiRequest('/api/conversations', { method: 'POST', body: { peerUserId } }),
    onSuccess: async (conversation) => {
      rememberConversation(conversation);
      queryClient.setQueryData(
        CHAT_KEYS.conversation(conversation.id),
        await openConversation(conversation),
      );
    },
  });
}

/** "This device received everything up to seq" — only over the live connection. */
export function reportDelivered(conversationId, upToSeq) {
  getConnectedSocket()?.emit(CLIENT_EVENTS.MESSAGE_DELIVERED, { conversationId, upToSeq });
}

/** "I have seen everything up to seq" — socket when connected, otherwise REST. */
export function reportRead(conversationId, upToSeq) {
  const socket = getConnectedSocket();
  if (socket) {
    socket.emit(CLIENT_EVENTS.CONVERSATION_READ, { conversationId, upToSeq });
    return Promise.resolve();
  }
  return apiRequest(`/api/conversations/${conversationId}/read`, {
    method: 'POST',
    body: { upToSeq },
  }).catch(() => {});
}

/** Replaces a cached message with a newer version (edit, unsend, reaction, pin). */
export function upsertMessage(queryClient, message) {
  queryClient.setQueryData(CHAT_KEYS.history(message.conversationId), (data) => {
    if (!data) return data;
    let found = false;
    const pages = data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((existing) => {
        if (existing.id !== message.id) return existing;
        found = true;
        return message.version >= (existing.version ?? 0) ? message : existing;
      }),
    }));
    if (!found) return data;
    return { ...data, pages };
  });
}

/** Drops a message from the cached history ("delete for me" on any of my devices). */
export function removeMessage(queryClient, conversationId, messageId) {
  queryClient.setQueryData(CHAT_KEYS.history(conversationId), (data) => {
    if (!data) return data;
    const pages = data.pages.map((page) => ({
      ...page,
      messages: page.messages.filter((message) => message.id !== messageId),
    }));
    return { ...data, pages };
  });
}

/** Mutation that applies the returned message to the cache and refreshes the chat list. */
function useMessageMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables) => openMessage(await mutationFn(variables)),
    onSuccess: (message) => {
      if (message) upsertMessage(queryClient, message);
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations });
    },
  });
}

/** Edits are encrypted like new messages (same message id, new envelope). */
export const useEditMessage = () =>
  useMessageMutation(async ({ message, text }) =>
    apiRequest(`/api/messages/${message.id}`, {
      method: 'PATCH',
      body: {
        envelope: await sealContent({
          conversationId: message.conversationId,
          clientMessageId: message.clientMessageId,
          content: { text },
        }),
      },
    }),
  );

export const useUnsendMessage = () =>
  useMessageMutation((id) =>
    apiRequest(`/api/messages/${id}?scope=everyone`, { method: 'DELETE' }),
  );

export const useReact = () =>
  useMessageMutation(({ id, emoji }) =>
    apiRequest(`/api/messages/${id}/reaction`, { method: 'PUT', body: { emoji } }),
  );

export const useUnreact = () =>
  useMessageMutation((id) => apiRequest(`/api/messages/${id}/reaction`, { method: 'DELETE' }));

export function usePinToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pinned }) =>
      openMessage(
        await apiRequest(`/api/messages/${id}/pin`, { method: pinned ? 'DELETE' : 'PUT' }),
      ),
    onSuccess: (message) => {
      upsertMessage(queryClient, message);
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.pins(message.conversationId) });
    },
  });
}

export function useDeleteForMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => apiRequest(`/api/messages/${id}?scope=me`, { method: 'DELETE' }),
    onSuccess: (_data, { id, conversationId }) => {
      removeMessage(queryClient, conversationId, id);
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations });
    },
  });
}

export function usePins(conversationId) {
  return useQuery({
    queryKey: CHAT_KEYS.pins(conversationId),
    queryFn: async ({ signal }) =>
      openMessages(await apiRequest(`/api/conversations/${conversationId}/pins`, { signal })),
  });
}

/** Clear chat / mute / color: the server returns the updated conversation summary. */
function useConversationMutation(mutationFn, { resetHistory = false } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (conversation) => {
      queryClient.setQueryData(
        CHAT_KEYS.conversation(conversation.id),
        await openConversation(conversation),
      );
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.list });
      if (resetHistory) queryClient.resetQueries({ queryKey: CHAT_KEYS.history(conversation.id) });
    },
  });
}

/** Delete chat for me: it disappears from my list (the friend keeps theirs). */
export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId) =>
      apiRequest(`/api/conversations/${conversationId}`, { method: 'DELETE' }),
    onSuccess: (_data, conversationId) => {
      queryClient.setQueryData(CHAT_KEYS.list, (list) =>
        list?.filter((conversation) => conversation.id !== conversationId),
      );
      queryClient.removeQueries({ queryKey: CHAT_KEYS.history(conversationId) });
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations });
    },
  });
}

export const useClearChat = () =>
  useConversationMutation(
    (conversationId) =>
      apiRequest(`/api/conversations/${conversationId}/clear`, { method: 'POST' }),
    { resetHistory: true },
  );

export const useUpdateChatSettings = () =>
  useConversationMutation(({ conversationId, ...changes }) =>
    apiRequest(`/api/conversations/${conversationId}/settings`, { method: 'PATCH', body: changes }),
  );

/**
 * Message search on this device (the server can't read encrypted messages): every word must
 * appear, ignoring case. Searches the messages this device has loaded, newest first.
 */
export function searchLoadedMessages(queryClient, q, conversationId) {
  const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.join('').length < 2) return [];
  const histories = conversationId
    ? [queryClient.getQueryData(CHAT_KEYS.history(conversationId))]
    : queryClient.getQueriesData({ queryKey: CHAT_KEYS.messages }).map(([, data]) => data);
  const seen = new Set();
  return histories
    .flatMap((data) => flattenHistory(data))
    .filter((message) => {
      if (!message.text || message.unsentAt || seen.has(message.id)) return false;
      seen.add(message.id);
      const text = message.text.toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
}

export function useMessageSearch(q, conversationId) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['message-search', conversationId ?? 'all', q],
    queryFn: () => searchLoadedMessages(queryClient, q, conversationId),
    enabled: q.trim().length >= 2,
    staleTime: 0,
  });
}

/** The latest few messages for the long-press preview: read-only, never reported as seen. */
export function useConversationPreview(conversationId) {
  return useQuery({
    queryKey: ['preview', conversationId],
    queryFn: async ({ signal }) => {
      const page = await apiRequest(`/api/conversations/${conversationId}/messages?limit=4`, {
        signal,
      });
      return { ...page, messages: await openMessages(page.messages) };
    },
    enabled: Boolean(conversationId),
    staleTime: 0,
  });
}

/**
 * Group changes (docs/GROUPS.md): rename, photo, members, admins, leave. The server announces
 * them to every member; here my own views refresh right away.
 */
export function useGroupAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action) => action(),
    onSuccess: async (result, action) => {
      if (result?.id) {
        queryClient.setQueryData(CHAT_KEYS.conversation(result.id), await openConversation(result));
      }
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations });
      return action;
    },
  });
}

export const groupRequests = {
  rename: (groupId, name) =>
    apiRequest(`/api/groups/${groupId}`, { method: 'PATCH', body: { name } }),
  setPhoto: (groupId, photoAttachmentId) =>
    apiRequest(`/api/groups/${groupId}`, { method: 'PATCH', body: { photoAttachmentId } }),
  setRole: (groupId, userId, role) =>
    apiRequest(`/api/groups/${groupId}/members/${userId}`, { method: 'PATCH', body: { role } }),
  remove: (groupId, userId) =>
    apiRequest(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  leave: (groupId) => apiRequest(`/api/groups/${groupId}/leave`, { method: 'POST' }),
};

/** Photos and videos of a chat, newest first, in pages (opened on this device). */
export function useChatMedia(conversationId, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: ['chat-media', conversationId],
    queryFn: async ({ pageParam, signal }) => {
      const page = await apiRequest(
        `/api/conversations/${conversationId}/media${pageParam ? `?before=${pageParam}` : ''}`,
        { signal },
      );
      return { ...page, messages: await openMessages(page.messages) };
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages.at(-1)?.seq : undefined),
    enabled,
    staleTime: 0,
  });
}

/**
 * The chat's history read separately from the open chat (for finding links), so loading older
 * pages here never moves what the chat screen is showing.
 */
export function useHistoryScan(conversationId, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: ['history-scan', conversationId],
    queryFn: async ({ pageParam, signal }) => {
      const page = await apiRequest(
        `/api/conversations/${conversationId}/messages?limit=50${pageParam ? `&before=${pageParam}` : ''}`,
        { signal },
      );
      return { ...page, messages: await openMessages(page.messages) };
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages[0]?.seq : undefined),
    enabled,
    staleTime: 0,
  });
}
