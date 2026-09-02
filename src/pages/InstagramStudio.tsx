import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getBrands, getBrandById, getInstagramAccount, saveInstagramAccount, 
  getInstagramDMAutomations, saveInstagramDMAutomation, Brand, InstagramAccount, 
  InstagramDMAutomation, getMediaAssets, MediaAsset
} from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import { 
  Instagram, Sparkles, MessageSquare, BarChart3, Settings, Plus, RefreshCw, 
  CheckCircle2, Film, Image as ImageIcon, Send, ArrowRight, Eye, Users, 
  TrendingUp, ShieldCheck, Tag, Copy, Check, Heart, Play, CornerDownRight
} from 'lucide-react';

export function InstagramStudio() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'content' | 'automation' | 'analytics' | 'settings'>('content');

  // Instagram Account State
  const [igAccount, setIgAccount] = useState<InstagramAccount | null>(null);
  const [igAccountId, setIgAccountId] = useState('');
  const [igHandle, setIgHandle] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Content Generator State
  const [postType, setPostType] = useState<'REELS' | 'SINGLE_POST' | 'CAROUSEL' | 'STORIES'>('REELS');
  const [prompt, setPrompt] = useState('');
  const [caption, setCaption] = useState('');
  const [firstCommentHashtags, setFirstCommentHashtags] = useState('#growth #business #marketing #ai #automation');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('video');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // DM Automation State
  const [dmRules, setDmRules] = useState<InstagramDMAutomation[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newReplyMessage, setNewReplyMessage] = useState('');
  const [captureEmail, setCaptureEmail] = useState(true);

  // Media Assets
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);

  const loadData = async (brandIdToLoad?: string) => {
    setLoading(true);
    try {
      const activeId = brandIdToLoad || localStorage.getItem('activeBrandId');
      let currentBrand: Brand | null = null;

      if (activeId) {
        currentBrand = await getBrandById(activeId);
      }
      if (!currentBrand) {
        const all = await getBrands();
        if (all.length > 0) currentBrand = all[0];
      }

      if (currentBrand) {
        setBrand(currentBrand);
        localStorage.setItem('activeBrandId', currentBrand.id);

        // Load Account
        const acc = getInstagramAccount(currentBrand.id);
        if (acc) {
          setIgAccount(acc);
          setIgAccountId(acc.instagramAccountId);
          setIgHandle(acc.handle);
          setAccessToken(acc.accessToken);
        } else {
          const defaultAcc: InstagramAccount = {
            id: 'ig_acc_' + currentBrand.id,
            brandId: currentBrand.id,
            instagramAccountId: '178414' + Math.floor(10000000 + Math.random() * 90000000),
            handle: currentBrand.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_official',
            accessToken: 'IGQVJ...' + Math.random().toString(36).substr(2, 10),
            followersCount: 14250,
            mediaCount: 184,
            status: 'CONNECTED'
          };
          saveInstagramAccount(defaultAcc);
          setIgAccount(defaultAcc);
          setIgAccountId(defaultAcc.instagramAccountId);
          setIgHandle(defaultAcc.handle);
          setAccessToken(defaultAcc.accessToken);
        }

        // Load DM Automation Rules
        const rules = getInstagramDMAutomations(currentBrand.id);
        if (rules.length === 0) {
          const seedRule: InstagramDMAutomation = {
            id: 'ig_dm_seed_1',
            brandId: currentBrand.id,
            keyword: 'PROMO',
            replyMessage: `Hey there! Thanks for reaching out to ${currentBrand.name}. Here is your exclusive 20% discount link: https://wotsocial.app/promo-20`,
            captureEmail: true,
            status: 'ACTIVE',
            triggeredCount: 342,
            leadsCaptured: 128,
            createdAt: new Date().toISOString()
          };
          saveInstagramDMAutomation(seedRule);
          setDmRules([seedRule]);
        } else {
          setDmRules(rules);
        }

        // Load Media Assets
        const assets = getMediaAssets().filter(a => !a.brandId || a.brandId === currentBrand?.id);
        setMediaAssets(assets);
        if (assets.length > 0) {
          setMediaUrl(assets[0].url);
          setMediaType(assets[0].type);
        }
      }
    } catch (err) {
      console.error("Error loading Instagram Studio:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleBrandChange = (e: any) => {
      if (e.detail) loadData(e.detail.id);
    };
    window.addEventListener('activeBrandChanged', handleBrandChange);
    return () => window.removeEventListener('activeBrandChanged', handleBrandChange);
  }, []);

  const handleSaveAccount = () => {
    if (!brand) return;
    const acc: InstagramAccount = {
      id: igAccount?.id || 'ig_acc_' + brand.id,
      brandId: brand.id,
      instagramAccountId: igAccountId || '178414000000000',
      handle: igHandle || brand.name.toLowerCase(),
      accessToken: accessToken || 'IG_TOKEN_SANDBOX',
      followersCount: igAccount?.followersCount || 14250,
      mediaCount: igAccount?.mediaCount || 184,
      status: 'CONNECTED'
    };
    saveInstagramAccount(acc);
    setIgAccount(acc);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleGenerateCaption = () => {
    if (!prompt.trim() || !brand) return;
    setGenerating(true);

    setTimeout(() => {
      const generatedCaption = `✨ ${prompt}\n\nTransforming how ${brand.name} delivers results! Tap the link in our bio to learn how you can automate your growth stack today. 🔥\n\nDrop a comment with "INFO" to get the link sent directly to your DMs! 📩`;
      const generatedHashtags = `#${brand.name.toLowerCase().replace(/\s+/g, '')} #instagramgrowth #reels #contentmarketing #ai #automation #viralreels`;

      setCaption(generatedCaption);
      setFirstCommentHashtags(generatedHashtags);
      setGenerating(false);
    }, 1200);
  };

  const handleAddDMRule = () => {
    if (!newKeyword.trim() || !newReplyMessage.trim() || !brand) return;
    const rule: InstagramDMAutomation = {
      id: 'ig_dm_' + Date.now(),
      brandId: brand.id,
      keyword: newKeyword.trim().toUpperCase(),
      replyMessage: newReplyMessage.trim(),
      captureEmail,
      status: 'ACTIVE',
      triggeredCount: 0,
      leadsCaptured: 0,
      createdAt: new Date().toISOString()
    };
    saveInstagramDMAutomation(rule);
    setDmRules([rule, ...dmRules]);
    setNewKeyword('');
    setNewReplyMessage('');
  };

  if (loading) return <div className="p-8 font-sans text-gray-500 animate-pulse">Loading Instagram Marketing Studio...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Instagram className="w-3.5 h-3.5" />
              Instagram Graph API Integration
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Instagram Marketing & DM Automation Studio</h1>
          <p className="text-gray-500 mt-1">Publish Reels & Stories, set up automated DM keyword responses, track profile growth, and manage your Instagram presence.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BrandSelector
            activeBrandId={brand?.id}
            onBrandChange={(selected) => {
              setBrand(selected);
              localStorage.setItem('activeBrandId', selected.id);
              loadData(selected.id);
            }}
          />

          <div className="bg-purple-50 border border-purple-200 px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold text-purple-900">
            <Instagram className="w-4 h-4 text-pink-600" />
            <span>@{igAccount?.handle || 'instagram'}</span>
          </div>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap bg-gray-100 p-1.5 rounded-2xl border border-gray-200 gap-1">
        <button
          onClick={() => setActiveTab('content')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'content' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Film className="w-4 h-4 text-pink-400" />
          1. Reels & Feed Content Studio
        </button>

        <button
          onClick={() => setActiveTab('automation')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'automation' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-purple-400" />
          2. DM Automation & Lead Capture ({dmRules.length})
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'analytics' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          3. Instagram Reach Analytics
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'settings' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Settings className="w-4 h-4 text-amber-400" />
          4. Instagram API Settings
        </button>
      </div>

      {/* Tab 1: Reels & Feed Content Generator */}
      {activeTab === 'content' && (
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-7 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-pink-500" />
                  Instagram Visual Post Generator
                </h3>
                <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                  {[
                    { id: 'REELS', label: 'Reel' },
                    { id: 'SINGLE_POST', label: 'Post' },
                    { id: 'CAROUSEL', label: 'Carousel' },
                    { id: 'STORIES', label: 'Story' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setPostType(t.id as any)}
                      className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                        postType === t.id ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Post Concept or Reels Script Goal</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. 5 steps to double SaaS MRR using AI automation tools. Add a strong hook at the beginning and call to action at the end."
                  rows={3}
                  className="w-full px-4 py-3 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <button
                onClick={handleGenerateCaption}
                disabled={generating || !prompt.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:opacity-95 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                {generating ? 'Generating Caption & Hashtags...' : 'Generate Instagram Caption & Hashtags'}
              </button>

              {/* Caption Output */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Caption & First Comment</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">First Comment Hashtags (Auto-Posted)</label>
                <input
                  type="text"
                  value={firstCommentHashtags}
                  onChange={(e) => setFirstCommentHashtags(e.target.value)}
                  className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono text-purple-700"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Media Preview & Publish */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Instagram className="w-5 h-5 text-pink-600" />
                  Instagram Post Preview
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-pink-100 text-pink-800 px-2 py-0.5 rounded">
                  {postType}
                </span>
              </div>

              {/* Mobile Phone Mockup Preview */}
              <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 shadow-xl max-w-sm mx-auto space-y-3">
                <div className="flex items-center justify-between px-2 text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-0.5">
                      <div className="w-full h-full bg-gray-900 rounded-full flex items-center justify-center text-[10px] font-bold">
                        {brand?.name.charAt(0)}
                      </div>
                    </div>
                    <span className="text-xs font-bold truncate">@{igAccount?.handle}</span>
                  </div>
                </div>

                <div className="relative h-64 bg-gray-800 rounded-xl overflow-hidden flex items-center justify-center border border-gray-700">
                  {mediaUrl ? (
                    mediaType === 'video' ? (
                      <video src={mediaUrl} controls className="w-full h-full object-cover" />
                    ) : (
                      <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="text-gray-500 text-xs">Select media below</div>
                  )}
                </div>

                <div className="px-2 space-y-1 text-white">
                  <div className="flex items-center gap-3 text-xs">
                    <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                    <Send className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] text-gray-300 line-clamp-3 leading-snug">
                    <span className="font-bold text-white mr-1.5">@{igAccount?.handle}</span>
                    {caption || 'Your caption preview will appear here.'}
                  </p>
                </div>
              </div>

              {/* Media Vault Picker */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Select Media for Instagram</div>
                <div className="grid grid-cols-4 gap-2">
                  {mediaAssets.slice(0, 4).map((a) => (
                    <div
                      key={a.id}
                      onClick={() => {
                        setMediaUrl(a.url);
                        setMediaType(a.type);
                      }}
                      className={`h-14 rounded-lg overflow-hidden border cursor-pointer ${
                        mediaUrl === a.url ? 'ring-2 ring-pink-500 border-pink-500' : 'border-gray-200'
                      }`}
                    >
                      {a.type === 'image' ? <img src={a.url} className="w-full h-full object-cover" /> : <video src={a.url} className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Instagram DM Automation Rules */}
      {activeTab === 'automation' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-gray-100 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                  Instagram DM Keyword Auto-Responder Workflows
                </h3>
                <p className="text-xs text-gray-500">Automatically reply to Instagram post comments and DMs containing target keywords with personalized links and lead capture forms.</p>
              </div>
            </div>

            {/* Create Rule Input Form */}
            <div className="bg-purple-50/50 p-5 rounded-2xl border border-purple-100 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-900">Create New Keyword Auto-Reply Rule</h4>
              
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Trigger Keyword</label>
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="e.g. PROMO, INFO, GUIDE"
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black uppercase font-bold"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-gray-700">Automated DM Reply Message & Link</label>
                  <input
                    type="text"
                    value={newReplyMessage}
                    onChange={(e) => setNewReplyMessage(e.target.value)}
                    placeholder="e.g. Thanks for reaching out! Here is your exclusive 20% discount code: SAVE20. Link: https://..."
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={captureEmail}
                    onChange={(e) => setCaptureEmail(e.target.checked)}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  Automatically capture user email in conversation
                </label>

                <button
                  onClick={handleAddDMRule}
                  disabled={!newKeyword.trim() || !newReplyMessage.trim()}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Add DM Automation Rule
                </button>
              </div>
            </div>

            {/* Active Rules List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Active Keyword Automation Rules ({dmRules.length})</h4>
              <div className="space-y-3">
                {dmRules.map((rule) => (
                  <div key={rule.id} className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 text-xs font-bold rounded-md font-mono">
                          KEYWORD: "{rule.keyword}"
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                          {rule.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-800 font-medium">{rule.replyMessage}</p>
                    </div>

                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Triggered</div>
                        <div className="font-bold text-gray-900">{rule.triggeredCount} DMs</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Leads Captured</div>
                        <div className="font-bold text-purple-600">{rule.leadsCaptured} Leads</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Instagram Analytics */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Instagram Followers</div>
            <div className="text-2xl font-bold text-gray-900">{igAccount?.followersCount.toLocaleString()}</div>
            <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> +12.4% this month
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Reel Plays</div>
            <div className="text-2xl font-bold text-gray-900">148,200</div>
            <div className="text-[10px] text-gray-500 font-semibold">Across {igAccount?.mediaCount} published posts</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Avg Engagement Rate</div>
            <div className="text-2xl font-bold text-purple-600">4.82%</div>
            <div className="text-[10px] text-gray-500 font-semibold">Benchmark: 2.1%</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Bio Link Clicks</div>
            <div className="text-2xl font-bold text-pink-600">1,840</div>
            <div className="text-[10px] text-pink-700 font-semibold">High Converting Profile</div>
          </div>
        </div>
      )}

      {/* Tab 4: API Settings */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm max-w-2xl mx-auto space-y-6">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Instagram className="w-5 h-5 text-pink-600" />
                Instagram Business API Connection
              </h3>
              <p className="text-xs text-gray-500">Connect your Instagram Business Account ID and Facebook Page Access Token.</p>
            </div>
            {savedSuccess && (
              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-200">
                Saved!
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Instagram Handle (@)</label>
              <input
                type="text"
                value={igHandle}
                onChange={(e) => setIgHandle(e.target.value)}
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Instagram Business Account ID</label>
              <input
                type="text"
                value={igAccountId}
                onChange={(e) => setIgAccountId(e.target.value)}
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Graph API Access Token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
              />
            </div>

            <button
              onClick={handleSaveAccount}
              className="w-full py-3 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Save Instagram API Connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
