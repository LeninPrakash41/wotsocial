import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../auth';
import { Sparkles, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

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
      setError(err.message || "Invalid credentials. Please try again.");
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
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-white text-black rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-white/10 font-bold text-2xl">
            W
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to WotSocial</h1>
          <p className="text-sm text-slate-400">Sign in to manage your AI agents & brand campaigns</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-slate-600"
                placeholder="admin@wotsocial.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-slate-600"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/5 disabled:opacity-50 mt-2"
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
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-3 text-slate-500 font-medium">Or</span>
          </div>
        </div>

        {/* Quick Admin Access Button */}
        <button
          type="button"
          onClick={handleQuickAdminLogin}
          disabled={loading}
          className="w-full py-3 bg-purple-950/40 border border-purple-800/50 hover:bg-purple-900/50 text-purple-200 font-medium rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          Quick Admin Sign In (1-Click)
        </button>

        <p className="text-center text-xs text-slate-500">
          Default Admin: <code className="text-slate-400">admin@wotsocial.com</code>
        </p>
      </div>
    </div>
  );
}
