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
        this.currentUserState = null;
      }
    } else {
      // Require sign-in by default
      this.currentUserState = null;
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
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: password_hash })
      });

      if (response.ok) {
        const data = await response.json();
        this.currentUserState = data.user;
        localStorage.setItem('wotsocial_user', JSON.stringify(data.user));
        this.listeners.forEach(l => l(data.user));
        return data.user;
      }
    } catch (err) {
      console.warn("API login failed, checking default admin credentials...", err);
    }

    // Fallback for default admin account
    if (email.trim().toLowerCase() === 'admin@wotsocial.com' && password_hash === 'Admin@123456') {
      this.currentUserState = DEFAULT_ADMIN_USER;
      localStorage.setItem('wotsocial_user', JSON.stringify(DEFAULT_ADMIN_USER));
      this.listeners.forEach(l => l(DEFAULT_ADMIN_USER));
      return DEFAULT_ADMIN_USER;
    }

    throw new Error('Invalid email or password.');
  }

  logout() {
    this.currentUserState = null;
    localStorage.removeItem('wotsocial_user');
    this.listeners.forEach(l => l(null));
  }
}

export const auth = new AuthManager();
