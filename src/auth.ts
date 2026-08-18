export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: string;
}

const DEFAULT_ADMIN_USER: User = {
  uid: 'admin-user-001',
  email: 'admin@wotsocial.com',
  displayName: 'WotSocial Admin',
  role: 'admin'
};

class AuthManager {
  private currentUserState: User | null = null;
  private listeners: ((user: User | null) => void)[] = [];

  constructor() {
    const saved = localStorage.getItem('wotsocial_user');
    if (saved) {
      try {
        this.currentUserState = JSON.parse(saved);
      } catch {
        this.currentUserState = DEFAULT_ADMIN_USER;
      }
    } else {
      // Default to seeded admin user
      this.currentUserState = DEFAULT_ADMIN_USER;
      localStorage.setItem('wotsocial_user', JSON.stringify(DEFAULT_ADMIN_USER));
    }
  }

  get currentUser(): User | null {
    return this.currentUserState;
  }

  onAuthStateChanged(callback: (user: User | null) => void) {
    this.listeners.push(callback);
    callback(this.currentUserState);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  async login(email: string, password_hash: string): Promise<User> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: password_hash })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Authentication failed');
    }

    const data = await response.json();
    this.currentUserState = data.user;
    localStorage.setItem('wotsocial_user', JSON.stringify(data.user));
    this.listeners.forEach(l => l(data.user));
    return data.user;
  }

  logout() {
    this.currentUserState = null;
    localStorage.removeItem('wotsocial_user');
    this.listeners.forEach(l => l(null));
  }
}

export const auth = new AuthManager();
