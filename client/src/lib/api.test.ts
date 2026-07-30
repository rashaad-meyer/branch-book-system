import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from './api';
import { getToken, setToken } from './auth';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('returns the parsed body on success', async () => {
    mockFetch(200, [{ id: 'b1' }]);
    await expect(api.get('/branches')).resolves.toEqual([{ id: 'b1' }]);
  });

  it('maps the error envelope to a typed ApiError', async () => {
    mockFetch(409, { error: { code: 'SLOT_TAKEN', message: 'Slot just got booked' } });
    const promise = api.post('/appointments', {});
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await promise.catch((error: ApiError) => {
      expect(error.status).toBe(409);
      expect(error.code).toBe('SLOT_TAKEN');
      expect(error.message).toBe('Slot just got booked');
    });
  });

  it('falls back to a generic error when the body is not the envelope', async () => {
    mockFetch(500, null);
    await expect(api.get('/health')).rejects.toMatchObject({ code: 'UNKNOWN_ERROR' });
  });

  it('sends the bearer token and clears it on a 401', async () => {
    setToken('stale-token');
    const fetchMock = mockFetch(401, { error: { code: 'INVALID_TOKEN', message: 'Expired' } });

    await expect(api.get('/staff/schedule?date=2026-08-03')).rejects.toMatchObject({
      status: 401,
    });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer stale-token');
    // Session expiry: the wrapper logs the user out so route guards redirect.
    expect(getToken()).toBeNull();
  });

  it('does not clear anything on a 401 without a token (login failure)', async () => {
    mockFetch(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Nope' } });
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(getToken()).toBeNull();
  });
});
