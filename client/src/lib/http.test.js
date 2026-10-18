import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, setCsrfToken } from './http.js';

function mockFetch(implementation) {
  vi.stubGlobal('fetch', vi.fn(implementation));
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the unwrapped data on success', async () => {
    mockFetch(async () => jsonResponse(200, { data: { status: 'ok' } }));

    await expect(apiRequest('/api/health')).resolves.toEqual({ status: 'ok' });
  });

  it('sends JSON bodies with same-origin credentials', async () => {
    mockFetch(async () => jsonResponse(200, { data: null }));

    await apiRequest('/api/example', { method: 'POST', body: { a: 1 } });

    expect(fetch).toHaveBeenCalledWith(
      '/api/example',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: '{"a":1}',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('sends the CSRF token on state-changing requests only', async () => {
    mockFetch(async () => jsonResponse(200, { data: null }));
    setCsrfToken('token-123');

    await apiRequest('/api/users/me', { method: 'PATCH', body: { bio: 'x' } });
    await apiRequest('/api/users/me');

    expect(fetch.mock.calls[0][1].headers['X-CSRF-Token']).toBe('token-123');
    expect(fetch.mock.calls[1][1].headers['X-CSRF-Token']).toBeUndefined();
    setCsrfToken(null);
  });

  it('returns null for 204 No Content responses', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));

    await expect(apiRequest('/api/auth/logout', { method: 'POST' })).resolves.toBeNull();
  });

  it('throws an ApiError carrying the server error code', async () => {
    mockFetch(async () =>
      jsonResponse(503, {
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable', requestId: 'r1' },
      }),
    );

    const error = await apiRequest('/api/health/ready').catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE', requestId: 'r1' });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(apiRequest('/api/health')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('treats non-JSON responses as INVALID_RESPONSE', async () => {
    mockFetch(async () => new Response('<html>proxy error</html>', { status: 502 }));

    await expect(apiRequest('/api/health')).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_RESPONSE',
    });
  });
});
