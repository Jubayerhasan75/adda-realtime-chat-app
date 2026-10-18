import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const socketState = vi.hoisted(() => ({ socket: null }));
const http = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../realtime/socketStore.js', () => ({ getConnectedSocket: () => socketState.socket }));
vi.mock('../../lib/http.js', () => http);
// Encryption itself is tested in src/crypto; here a stand-in "seals" the content visibly.
vi.mock('../e2ee/messages.js', () => ({
  sealContent: async ({ content }) => ({ v: 1, ct: `sealed:${content.text ?? ''}` }),
  openMessage: async (message) => message,
}));

const { enqueueMessage, flushOutbox, retryMessage, startOutbox, stopOutbox } =
  await import('./outbox.js');

/** A fake connected socket whose acknowledgements are scripted per call. */
function fakeSocket(responses) {
  const emitWithAck = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return { emitWithAck, timeout: () => ({ emitWithAck }) };
}

const stored = (clientMessageId) => ({
  ok: true,
  data: { message: { id: 'server-id', seq: 1, clientMessageId, conversationId: 'c1' } },
});

let sent;

beforeEach(async () => {
  vi.useFakeTimers();
  sent = [];
  await startOutbox('me', { onMessageSent: (message) => sent.push(message) });
});

afterEach(() => {
  stopOutbox();
  socketState.socket = null;
  http.apiRequest.mockReset();
  vi.useRealTimers();
});

describe('outbox', () => {
  it('sends over the socket and hands the stored message back', async () => {
    const socket = fakeSocket([]);
    socket.emitWithAck.mockImplementation(async (_event, payload) =>
      stored(payload.clientMessageId),
    );
    socketState.socket = socket;

    enqueueMessage('c1', 'hello');
    await vi.runAllTimersAsync();

    const [, payload] = socket.emitWithAck.mock.calls[0];
    // Only the encrypted envelope leaves the device, never the readable text.
    expect(payload).toMatchObject({ conversationId: 'c1', envelope: { ct: 'sealed:hello' } });
    expect(payload).not.toHaveProperty('text');
    expect(sent).toEqual([expect.objectContaining({ id: 'server-id' })]);
  });

  it('retries a timed-out send with the SAME clientMessageId (no duplicates on the server)', async () => {
    const socket = fakeSocket([new Error('timeout'), new Error('timeout')]);
    socket.emitWithAck.mockImplementationOnce(async () => {
      throw new Error('timeout');
    });
    socketState.socket = socket;

    enqueueMessage('c1', 'hello');
    await vi.runAllTimersAsync();

    const ids = socket.emitWithAck.mock.calls.map(([, payload]) => payload.clientMessageId);
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(1);
  });

  it('marks a permanently refused message as failed without retrying, and can retry on request', async () => {
    const refusal = {
      ok: false,
      error: { code: 'NOT_FRIENDS', message: 'You can only message your friends' },
    };
    const socket = fakeSocket([refusal]);
    socketState.socket = socket;

    enqueueMessage('c1', 'hello');
    await vi.runAllTimersAsync();
    expect(socket.emitWithAck).toHaveBeenCalledOnce();

    const clientMessageId = socket.emitWithAck.mock.calls[0][1].clientMessageId;
    socket.emitWithAck.mockImplementationOnce(async () => stored(clientMessageId));
    retryMessage(clientMessageId);
    await vi.runAllTimersAsync();
    expect(sent).toHaveLength(1);
  });

  it('waits while offline and sends when the connection returns', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    enqueueMessage('c1', 'written offline');
    await vi.runAllTimersAsync();
    expect(http.apiRequest).not.toHaveBeenCalled();

    const socket = fakeSocket([]);
    socket.emitWithAck.mockImplementation(async (_e, payload) => stored(payload.clientMessageId));
    socketState.socket = socket;
    flushOutbox();
    await vi.runAllTimersAsync();

    expect(sent).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it('falls back to REST when the live connection is down but the network works', async () => {
    http.apiRequest.mockImplementation(async (_url, { body }) => ({
      message: { id: 'rest-id', clientMessageId: body.clientMessageId, conversationId: 'c1' },
    }));

    enqueueMessage('c1', 'via rest');
    await vi.runAllTimersAsync();

    expect(http.apiRequest).toHaveBeenCalledWith(
      '/api/conversations/c1/messages',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(sent[0].id).toBe('rest-id');
  });
});
