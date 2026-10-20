/**
 * Error thrown for any failed API call. `code` mirrors the server's ERROR_CODES, or is
 * NETWORK_ERROR / INVALID_RESPONSE for failures that never produced an API response.
 */
export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);
let csrfToken = null;

/** Stores the session's CSRF token (from GET /api/auth/session or login) for later requests. */
export function setCsrfToken(token) {
  csrfToken = token;
}

/** For the few requests that can't use apiRequest (file uploads with progress). */
export function getCsrfToken() {
  return csrfToken;
}

// A request that gets no answer at all fails after this long instead of waiting forever. Long
// enough for the free server to wake up from sleep (about a minute).
const DEFAULT_TIMEOUT_MS = 75_000;

/** A signal that aborts after `ms` (built by hand: older iPhones lack AbortSignal.timeout). */
function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.clear = () => clearTimeout(timer);
  return controller.signal;
}

/** Aborts when either signal does (AbortSignal.any isn't available on iOS before 17.4). */
function eitherSignal(first, second) {
  if (!first) return second;
  if (first.aborted) return first;
  const controller = new AbortController();
  const abort = () => controller.abort();
  first.addEventListener('abort', abort, { once: true });
  second.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

/**
 * Calls the same-origin JSON API and unwraps the `{ data }` / `{ error }` envelope.
 * @param {string} path e.g. '/api/health'
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal, timeoutMs?: number }} [options]
 */
export async function apiRequest(
  path,
  { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  let response;
  const timeout = timeoutSignal(timeoutMs);
  try {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrfToken && !SAFE_METHODS.has(method)) headers['X-CSRF-Token'] = csrfToken;
    response = await fetch(path, {
      method,
      signal: eitherSignal(signal, timeout),
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (timeout?.aborted && !signal?.aborted) {
      throw new ApiError({
        status: 0,
        code: 'TIMEOUT',
        message: 'The server took too long to answer',
      });
    }
    if (err.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server' });
  } finally {
    timeout.clear();
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code ?? 'INVALID_RESPONSE',
      message: payload?.error?.message ?? `Request failed with status ${response.status}`,
      details: payload?.error?.details,
      requestId: payload?.error?.requestId,
    });
  }
  if (!payload || !('data' in payload)) {
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: 'Unexpected response from the server',
    });
  }
  return payload.data;
}
