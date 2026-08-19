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

  if (loading) return <div className="p-8 font-sans text-gray-500">Loading Profile Hub...</div>;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Account Profile & Workspace Settings</h1>
          <p className="text-gray-500 mt-1">Manage your identity, organization team credentials, and API connections.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            Enterprise Admin Active
          </span>
        </div>
      </header>

      {/* Usage Stats Overview Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{brandCount}</div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Brands</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{postCount}</div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Posts & Assets Created</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{trendCount}</div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Saved Trend Ideas</div>
          </div>
        </div>
      </div>

      {/* Main Profile Grid */}
      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* Left Column: Personal Identity & Info */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-6 border-b border-gray-100 pb-6">
              <div className="relative group shrink-0">
                <div className="w-20 h-20 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden">
                  {photoURL ? (
                    <img src={photoURL} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-gray-400" />
                  )}
                </div>
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="w-5 h-5" />
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>

              <div>
                <h3 className="font-bold text-xl text-gray-900">{displayName || 'Admin User'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{user?.email || 'admin@wotsocial.ai'}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-black text-white px-2.5 py-0.5 rounded">Workspace Owner</span>
                  <span className="text-[10px] text-gray-400 font-mono">ID: {user?.uid?.slice(0, 10) || 'usr_001'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Display Full Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Email Address (Primary Login)</label>
                <input
                  type="email"
                  value={user?.email || 'admin@wotsocial.ai'}
                  disabled
                  className="w-full px-3.5 py-2.5 text-xs border border-gray-200 bg-gray-50 text-gray-500 rounded-xl cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Organization Name</label>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {saved ? <Check className="w-4 h-4 text-emerald-400" /> : null}
                {saved ? 'Changes Saved!' : 'Save Profile Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: API Keys & Integration Status */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500" />
                API Connection Status
              </h3>
              <button
                onClick={() => navigate('/integrations')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                Manage <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="font-semibold text-gray-800">Google Gemini 3.1 AI</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hasGemini ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {hasGemini ? 'Connected' : 'Missing Key'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="font-semibold text-gray-800">Anthropic Claude AI</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hasClaude ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {hasClaude ? 'Connected' : 'Optional'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="font-semibold text-gray-800">SeeDance Video Engine</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hasSeeDance ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {hasSeeDance ? 'Connected' : 'Optional'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="font-semibold text-gray-800">OpenArt Image Engine</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hasOpenArt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {hasOpenArt ? 'Connected' : 'Optional'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => navigate('/integrations')}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold text-xs rounded-xl border border-gray-200 transition-all flex items-center justify-center gap-1.5"
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
