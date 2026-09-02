import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { auth } from '../auth';
import { Mail, Lock, ArrowRight, ShieldCheck, AlertCircle, Loader2, Sparkles, Bot } from 'lucide-react';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('admin@wotsocial.com');
  const [password, setPassword] = useState('Admin@123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await auth.login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdminLogin = async () => {
    setEmail('admin@wotsocial.com');
    setPassword('Admin@123456');
    setError(null);
    setLoading(true);

    try {
      await auth.login('admin@wotsocial.com', 'Admin@123456');
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Quick admin sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f4] text-[#0a0a0a] font-sans flex flex-col justify-between p-4 md:p-8">
      {/* Navigation Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-2">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 bg-ink rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
            <span className="text-white font-bold text-xl">W</span>
          </div>
          <span className="font-bold text-xl tracking-tight text-ink">WotSocial</span>
        </Link>
        <span className="text-xs font-semibold px-3 py-1 bg-sunk text-ink-2 border border-line rounded-full flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-ink" />
          Agentic Social Automation Platform
        </span>
      </header>

      {/* Main Login Card Container */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="bg-surface border border-line rounded-3xl p-8 md:p-10 shadow-sm hover:shadow-md transition-shadow space-y-6">
          {/* Brand & Heading */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-ink rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-black/10">
              <span className="text-white font-bold text-2xl">W</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Sign in to WotSocial</h1>
            <p className="text-sm text-ink-3">Access your social media expertise AI agents & ad campaigns</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="bg-danger-soft border border-danger-line rounded-xl p-3.5 flex items-center gap-3 text-danger text-sm">
              <AlertCircle className="w-5 h-5 text-danger shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-3 uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-sunk border border-line focus:bg-surface focus:border-ink focus:ring-2 focus:ring-ink/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink outline-none transition-all placeholder:text-ink-4 font-medium"
                  placeholder="admin@wotsocial.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-3 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-sunk border border-line focus:bg-surface focus:border-ink focus:ring-2 focus:ring-ink/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink outline-none transition-all placeholder:text-ink-4 font-medium"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-ink text-white font-medium rounded-xl hover:bg-ink-2 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm disabled:opacity-50 mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-surface px-3 text-ink-4 font-medium tracking-wider">Or</span>
            </div>
          </div>

          {/* Quick Admin Access Button */}
          <button
            type="button"
            onClick={handleQuickAdminLogin}
            disabled={loading}
            className="w-full py-3 bg-sunk hover:bg-line text-ink border border-line font-semibold rounded-xl transition-all text-sm flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4 text-ink" />
            Quick Admin Sign In (1-Click)
          </button>

          {/* Credentials Info Badge */}
          <div className="bg-sunk border border-line rounded-2xl p-3.5 text-center text-xs text-ink-3 space-y-1">
            <div className="font-semibold text-ink-2 flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-ink" />
              Seeded Admin Credentials
            </div>
            <p>Email: <code className="bg-line/60 px-1.5 py-0.5 rounded text-ink-2 font-mono text-[11px]">admin@wotsocial.com</code></p>
            <p>Password: <code className="bg-line/60 px-1.5 py-0.5 rounded text-ink-2 font-mono text-[11px]">Admin@123456</code></p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto text-center py-4 text-xs text-ink-3">
        © {new Date().getFullYear()} WotSocial AI Platform. Powered by Gemini & Claude Multi-Agent Automation.
      </footer>
    </div>
  );
}
