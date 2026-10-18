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

/**
 * Calls the same-origin JSON API and unwraps the `{ data }` / `{ error }` envelope.
 * @param {string} path e.g. '/api/health'
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [options]
 */
export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrfToken && !SAFE_METHODS.has(method)) headers['X-CSRF-Token'] = csrfToken;
    response = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server' });
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
