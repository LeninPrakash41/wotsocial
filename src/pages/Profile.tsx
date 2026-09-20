import React, { useState, useEffect } from 'react';
import { auth } from '../auth';
import { getBrands, getSavedTrends, getPosts } from '../dbAdapter';
import { 
  User, Mail, Shield, Check, Camera, Key, Briefcase, BarChart3, Bot, Film, Sparkles, Lock, ArrowRight, Layers 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [organization, setOrganization] = useState('WotSocial Enterprise Workspace');
  const [photoURL, setPhotoURL] = useState('');

  // Stats
  const [brandCount, setBrandCount] = useState(0);
  const [trendCount, setTrendCount] = useState(0);
  const [postCount, setPostCount] = useState(0);

  // Key Status
  const [hasGemini, setHasGemini] = useState(false);
  const [hasClaude, setHasClaude] = useState(false);
  const [hasOpenArt, setHasOpenArt] = useState(false);
  const [hasSeeDance, setHasSeeDance] = useState(false);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) {
      setUser(u);
      setDisplayName(u.displayName || 'WotSocial Admin');
    }

    const loadData = async () => {
      try {
        const brands = await getBrands();
        setBrandCount(brands.length);

        const posts = await getPosts();
        setPostCount(posts.length);

        const trends = getSavedTrends();
        setTrendCount(trends.length);

        setHasGemini(!!localStorage.getItem('gemini_api_key'));
        setHasClaude(!!localStorage.getItem('claude_api_key'));
        setHasOpenArt(!!localStorage.getItem('openart_api_key'));
        setHasSeeDance(!!localStorage.getItem('seedance_api_key'));
      } catch (err) {
        console.error("Error loading profile stats:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }, 500);
  };

  const handlePhotoUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoURL(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) return <div className="p-8 font-sans text-ink-3">Loading Profile Hub...</div>;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Account Profile & Workspace Settings</h1>
          <p className="text-ink-3 mt-1">Manage your identity, organization team credentials, and API connections.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider bg-ok-soft text-ok border border-ok-line px-3 py-1 rounded-full flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-ok" />
            Enterprise Admin Active
          </span>
        </div>
      </header>

      {/* Usage Stats Overview Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-accent-soft text-accent rounded-xl">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-ink">{brandCount}</div>
            <div className="text-xs font-semibold text-ink-3 uppercase tracking-wider">Active Brands</div>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-accent-soft text-accent rounded-xl">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-ink">{postCount}</div>
            <div className="text-xs font-semibold text-ink-3 uppercase tracking-wider">Posts & Assets Created</div>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-warn-soft text-warn rounded-xl">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-ink">{trendCount}</div>
            <div className="text-xs font-semibold text-ink-3 uppercase tracking-wider">Saved Trend Ideas</div>
          </div>
        </div>
      </div>

      {/* Main Profile Grid */}
      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* Left Column: Personal Identity & Info */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-surface border border-line rounded-2xl p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-6 border-b border-line pb-6">
              <div className="relative group shrink-0">
                <div className="w-20 h-20 rounded-full bg-sunk border-2 border-line flex items-center justify-center overflow-hidden">
                  {photoURL ? (
                    <img src={photoURL} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-ink-4" />
                  )}
                </div>
                <label className="absolute inset-0 flex items-center justify-center bg-ink/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="w-5 h-5" />
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>

              <div>
                <h3 className="font-bold text-xl text-ink">{displayName || 'Admin User'}</h3>
                <p className="text-xs text-ink-3 mt-0.5">{user?.email || 'admin@wotsocial.ai'}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-ink text-white px-2.5 py-0.5 rounded">Workspace Owner</span>
                  <span className="text-[10px] text-ink-4 font-mono">ID: {user?.uid?.slice(0, 10) || 'usr_001'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-2">Display Full Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-2">Email Address (Primary Login)</label>
                <input
                  type="email"
                  value={user?.email || 'admin@wotsocial.ai'}
                  disabled
                  className="w-full px-3.5 py-2.5 text-xs border border-line bg-sunk text-ink-3 rounded-xl cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-2">Organization Name</label>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 bg-ink hover:bg-ink-2 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {saved ? <Check className="w-4 h-4 text-ok" /> : null}
                {saved ? 'Changes Saved!' : 'Save Profile Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: API Keys & Integration Status */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-bold text-ink text-xs uppercase tracking-wider flex items-center gap-2">
                <Key className="w-4 h-4 text-warn" />
                API Connection Status
              </h3>
              <button
                onClick={() => navigate('/integrations')}
                className="text-xs font-bold text-accent hover:text-accent-ink flex items-center gap-1"
              >
                Manage <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-sunk rounded-xl border border-line">
                <span className="font-semibold text-ink-2">Google Gemini 3.1 AI</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hasGemini ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
                  {hasGemini ? 'Connected' : 'Missing Key'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-sunk rounded-xl border border-line">
                <span className="font-semibold text-ink-2">Anthropic Claude AI</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hasClaude ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
                  {hasClaude ? 'Connected' : 'Optional'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-sunk rounded-xl border border-line">
                <span className="font-semibold text-ink-2">SeeDance Video Engine</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hasSeeDance ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
                  {hasSeeDance ? 'Connected' : 'Optional'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-sunk rounded-xl border border-line">
                <span className="font-semibold text-ink-2">OpenArt Image Engine</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hasOpenArt ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
                  {hasOpenArt ? 'Connected' : 'Optional'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => navigate('/integrations')}
                className="w-full py-2.5 bg-sunk hover:bg-line text-ink font-bold text-xs rounded-xl border border-line transition-all flex items-center justify-center gap-1.5"
              >
                <Key className="w-3.5 h-3.5" /> Configure All API Credentials
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
