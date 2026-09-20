/**
 * The single place the browser talks to the API.
 *
 * Every request carries the session token, and a rejected token signs the user
 * out once rather than leaving four separate callers to notice independently.
 */
import { auth } from './auth';

export const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const token = auth.getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
};

/**
 * `fetch` with the session attached.
 *
 * On a 401 the local session is cleared, so an expired or revoked token sends
 * the user back to sign-in instead of leaving the app showing stale data it
 * can no longer refresh.
 */
export const authFetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
  const res = await fetch(input, {
    ...init,
    headers: authHeaders((init.headers as Record<string, string>) || {})
  });

  if (res.status === 401) {
    auth.handleUnauthorized();
  }
  return res;
};
