/**
 * Client-side session handling.
 *
 * Previously this stored a user object in localStorage and the server took the
 * browser's word for who it was — and if the API call failed it fell back to a
 * hardcoded admin credential, which was a sign-in backdoor that worked whether
 * or not the account existed. Both are gone: the server issues a token, every
 * request carries it, and the server decides what it means.
 */

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: string;
}

const TOKEN_KEY = 'wotsocial_token';
const USER_KEY = 'wotsocial_user';

/**
 * The token lives in localStorage rather than an httpOnly cookie.
 *
 * The trade-off: a bearer token in a header carries no ambient authority, so
 * there is no CSRF surface, but it is readable by script and so exposed to
 * XSS. An httpOnly cookie inverts that. Bearer was chosen because this is a
 * single-page app calling its own API; if the threat model shifts toward
 * untrusted third-party script on the page, move to cookies and add CSRF
 * tokens rather than trying to have both.
 */
class AuthManager {
  private currentUserState: User | null = null;
  private token: string | null = null;
  private listeners: ((user: User | null) => void)[] = [];

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
    const saved = localStorage.getItem(USER_KEY);

    // A user without a token is a leftover from the old scheme: it is not a
    // session, so treat it as signed out.
    if (this.token && saved) {
      try {
        this.currentUserState = JSON.parse(saved);
      } catch {
        this.clearLocal();
      }
    } else {
      this.clearLocal();
    }
  }

  private clearLocal() {
    this.currentUserState = null;
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  get currentUser(): User | null {
    return this.currentUserState;
  }

  getToken(): string | null {
    return this.token;
  }

  onAuthStateChanged(callback: (user: User | null) => void) {
    this.listeners.push(callback);
    callback(this.currentUserState);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.currentUserState));
  }

  async login(email: string, password: string): Promise<User & { mustChangePassword?: boolean }> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      // The server's message is already written for the person reading it —
      // wrong credentials, locked out, and so on.
      throw new Error(body?.error || 'Could not sign in. Please try again.');
    }

    this.token = body.token;
    this.currentUserState = body.user;
    localStorage.setItem(TOKEN_KEY, body.token);
    localStorage.setItem(USER_KEY, JSON.stringify(body.user));
    this.notify();

    return { ...body.user, mustChangePassword: Boolean(body.mustChangePassword) };
  }

  /** Confirms a stored token is still valid, e.g. on a page reload. */
  async refresh(): Promise<User | null> {
    if (!this.token) return null;
    try {
      const res = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      if (!res.ok) {
        this.clearLocal();
        this.notify();
        return null;
      }
      const body = await res.json();
      this.currentUserState = body.user;
      localStorage.setItem(USER_KEY, JSON.stringify(body.user));
      this.notify();
      return body.user;
    } catch {
      // A network blip should not sign someone out; keep what we have.
      return this.currentUserState;
    }
  }

  async logout() {
    const token = this.token;
    this.clearLocal();
    this.notify();

    if (token) {
      // Best effort: the local session is already gone either way.
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => undefined);
    }
  }

  /** Called when the API rejects the token, so the UI returns to sign-in. */
  handleUnauthorized() {
    if (!this.token && !this.currentUserState) return;
    this.clearLocal();
    this.notify();
  }
}

export const auth = new AuthManager();
