import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getBrands, getBrandById, Brand, InstagramAccount,
  InstagramDMAutomation, getMediaAssets, MediaAsset
} from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import { PhoneFrame, MediaSlot, PreviewSurface, TabNav } from '../components/ui';
import {
  instagramApi, getOAuthStatus, startOAuth, runOAuthPopup,
  describeError, PublicConnection, IgProfile
} from '../services/integrationsApi';
import { generateClaudeJSON } from '../services/claudeService';
import { generateGeminiJSON } from '../services/geminiService';
import { 
  Instagram, Sparkles, MessageSquare, BarChart3, Settings, Plus, RefreshCw,
  MoreHorizontal, MessageCircle, Bookmark, 
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

  // Live connection state — replaces the previous auto-seeded sandbox account.
  const [connection, setConnection] = useState<PublicConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [profile, setProfile] = useState<IgProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [webhooksConfigured, setWebhooksConfigured] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success' | 'info'; message: string; detail?: string } | null>(null);
  const [publishResult, setPublishResult] = useState<{ mediaId: string; permalink: string } | null>(null);
  const [publications, setPublications] = useState<any[]>([]);
  const [insights, setInsights] = useState<Record<string, any> | null>(null);
  const [recentMedia, setRecentMedia] = useState<any[]>([]);

  const loadData = async (brandIdToLoad?: string) => {
    setLoading(true);
    setBanner(null);
    try {
      const activeId = brandIdToLoad || localStorage.getItem('activeBrandId');
      let currentBrand: Brand | null = null;

      if (activeId) currentBrand = await getBrandById(activeId);
      if (!currentBrand) {
        const all = await getBrands();
        if (all.length > 0) currentBrand = all[0];
      }
      if (!currentBrand) { setBrand(null); return; }

      setBrand(currentBrand);
      localStorage.setItem('activeBrandId', currentBrand.id);

      getOAuthStatus()
        .then(st => { setOauthConfigured(st.configured); setWebhooksConfigured(st.webhookConfigured); })
        .catch(() => {});

      const connRes = await instagramApi.connection(currentBrand.id);
      setConnected(connRes.connected);
      setConnection(connRes.connection);
      setProfile(connRes.profile);

      if (connRes.profile) {
        setIgAccountId(connRes.profile.id);
        setIgHandle(connRes.profile.username);
      }
      if (connRes.connection && !connRes.connected) {
        setBanner({
          kind: 'error',
          message: connRes.error || connRes.connection.lastError || 'The stored Instagram token is no longer valid. Reconnect the account.'
        });
      }

      // DM rules live on the server so the webhook can act on them.
      const rulesRes = await instagramApi.dmRules(currentBrand.id);
      setDmRules(rulesRes.rules as InstagramDMAutomation[]);

      instagramApi.publications(currentBrand.id).then(r => setPublications(r.publications)).catch(() => {});

      if (connRes.connected) {
        instagramApi.insights(currentBrand.id).then(r => setInsights(r.metrics)).catch(() => setInsights(null));
        instagramApi.media(currentBrand.id).then(r => setRecentMedia(r.media)).catch(() => setRecentMedia([]));
      } else {
        setInsights(null);
        setRecentMedia([]);
      }

      const assets = getMediaAssets().filter(a => !a.brandId || a.brandId === currentBrand?.id);
      setMediaAssets(assets);
      if (assets.length > 0 && !mediaUrl) {
        setMediaUrl(assets[0].url);
        setMediaType(assets[0].type);
      }
    } catch (err) {
      setBanner({ kind: 'error', message: `Failed to load the Instagram Studio: ${describeError(err)}` });
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

  /** Verifies the token with Meta, then stores it encrypted server-side. */
  const handleConnectAccount = async () => {
    if (!brand) return;
    if (!accessToken.trim()) {
      setBanner({ kind: 'error', message: 'Paste a Meta access token with instagram_content_publish permission.' });
      return;
    }
    setConnecting(true);
    setBanner(null);
    try {
      const res = await instagramApi.connect({
        brandId: brand.id,
        accessToken: accessToken.trim(),
        instagramAccountId: igAccountId.trim() || undefined
      });
      setConnection(res.connection);
      setProfile(res.profile);
      setConnected(true);
      setIgHandle(res.profile.username);
      setIgAccountId(res.profile.id);
      setAccessToken(''); // The raw token now lives only on the server.
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      setBanner({
        kind: 'success',
        message: `Connected to @${res.profile.username} — ${res.profile.followersCount.toLocaleString()} followers.`
      });
      loadData(brand.id);
    } catch (err) {
      setConnected(false);
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setConnecting(false);
    }
  };

  const handleOAuthConnect = async () => {
    if (!brand) return;
    setConnecting(true);
    setBanner(null);
    try {
      const { url } = await startOAuth(brand.id, 'instagram');
      const result = await runOAuthPopup(url);
      if (result.success) {
        setBanner({ kind: 'success', message: 'Instagram account connected.' });
        await loadData(brand.id);
      } else {
        setBanner({ kind: 'error', message: result.error || 'The connection was not completed.' });
      }
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!brand) return;
    try {
      await instagramApi.disconnect(brand.id);
      setConnection(null);
      setConnected(false);
      setProfile(null);
      setBanner({ kind: 'info', message: 'Instagram disconnected. Stored credentials were deleted.' });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  /** Real caption generation through the configured AI provider. */
  const handleGenerateCaption = async () => {
    if (!prompt.trim() || !brand) return;
    setGenerating(true);
    setBanner(null);
    try {
      const claudeKey = (localStorage.getItem('claude_api_key') || '').trim();
      const geminiKey = (localStorage.getItem('gemini_api_key') || '').trim();
      if (!claudeKey && !geminiKey) {
        throw new Error('No AI key configured. Add a Gemini or Claude API key in Integrations to generate captions.');
      }

      const systemPrompt =
        'You are an expert Instagram content strategist. You write scroll-stopping captions with a strong hook, ' +
        'genuine value, and a clear call to action.';
      const userPrompt = `Write an Instagram ${postType} caption for the brand "${brand.name}"` +
        `${brand.industry ? ` (${brand.industry})` : ''}.\n` +
        `Brand voice: ${brand.brandTone || 'professional and engaging'}.\n` +
        `Topic: ${prompt.trim()}\n\n` +
        'Return JSON: { "caption": "the caption with line breaks and emoji", "hashtags": "20 space-separated hashtags starting with #" }';

      const result = claudeKey
        ? await generateClaudeJSON<{ caption: string; hashtags: string }>({ systemPrompt, userPrompt })
        : await generateGeminiJSON<{ caption: string; hashtags: string }>(systemPrompt, userPrompt);

      setCaption(result.caption || '');
      setFirstCommentHashtags(result.hashtags || '');
    } catch (err) {
      setBanner({ kind: 'error', message: `Caption generation failed: ${describeError(err)}` });
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Publishes for real through the Graph API container flow.
   * Reels and video go through transcoding, so this can take a while — the
   * server polls the container and only reports success once Meta publishes.
   */
  const handlePublishToInstagram = async () => {
    if (!brand) return;
    if (!connected) {
      setBanner({ kind: 'error', message: 'Connect an Instagram Business account before publishing.' });
      setActiveTab('settings');
      return;
    }
    if (!mediaUrl) {
      setBanner({ kind: 'error', message: 'Select media to publish.' });
      return;
    }
    if (mediaUrl.startsWith('data:') || mediaUrl.startsWith('blob:')) {
      setBanner({
        kind: 'error',
        message: 'Instagram fetches media from a public URL — it cannot read a local or embedded file. Host the asset first, then publish.'
      });
      return;
    }
    if (!window.confirm(`This will publish to @${profile?.username} immediately and it will be visible to followers. Continue?`)) {
      return;
    }

    setPublishing(true);
    setBanner(null);
    setPublishResult(null);

    const apiMediaType =
      postType === 'REELS' ? 'REELS' : postType === 'STORIES' ? 'STORIES' : 'IMAGE';

    try {
      const res = await instagramApi.publish({
        brandId: brand.id,
        mediaType: apiMediaType,
        mediaUrl: mediaType === 'image' ? mediaUrl : undefined,
        videoUrl: mediaType === 'video' ? mediaUrl : undefined,
        caption,
        firstComment: firstCommentHashtags || undefined
      });

      setPublishResult({ mediaId: res.mediaId, permalink: res.permalink });
      setBanner({
        kind: 'success',
        message: `Published to @${profile?.username}. Media ID ${res.mediaId}.`,
        detail: res.firstComment && res.firstComment !== 'posted'
          ? `The post is live, but the hashtag comment did not post — ${res.firstComment}`
          : undefined
      });
      instagramApi.publications(brand.id).then(r => setPublications(r.publications)).catch(() => {});
    } catch (err) {
      setBanner({ kind: 'error', message: `Instagram publish failed: ${describeError(err)}` });
    } finally {
      setPublishing(false);
    }
  };

  /** DM rules are stored server-side; the webhook is what actually fires them. */
  const handleAddDMRule = async () => {
    if (!newKeyword.trim() || !newReplyMessage.trim() || !brand) return;
    setBanner(null);
    try {
      const res = await instagramApi.saveDmRule({
        brandId: brand.id,
        keyword: newKeyword.trim().toUpperCase(),
        replyMessage: newReplyMessage.trim(),
        captureEmail
      });
      const refreshed = await instagramApi.dmRules(brand.id);
      setDmRules(refreshed.rules as InstagramDMAutomation[]);
      setNewKeyword('');
      setNewReplyMessage('');

      if (res.warning) setBanner({ kind: 'info', message: res.warning });
      else setBanner({ kind: 'success', message: `Rule saved. Incoming DMs containing "${newKeyword.trim().toUpperCase()}" will now get an automatic reply.` });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  const handleDeleteDMRule = async (id: string) => {
    if (!brand) return;
    try {
      await instagramApi.deleteDmRule(id);
      setDmRules(dmRules.filter(r => r.id !== id));
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  /** Instagram crops each surface differently; the preview follows suit. */
  const previewSurface: PreviewSurface =
    postType === 'REELS' || postType === 'STORIES' ? 'story'
      : postType === 'CAROUSEL' ? 'square'
      : 'feed';

  if (loading) return <div className="p-8 font-sans text-ink-3 animate-pulse">Loading Instagram Marketing Studio...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-accent px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Instagram className="w-3.5 h-3.5" />
              Instagram Graph API Integration
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Instagram Marketing & DM Automation Studio</h1>
          <p className="text-ink-3 mt-1">Publish Reels & Stories, set up automated DM keyword responses, track profile growth, and manage your Instagram presence.</p>
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

          {connected ? (
            <div className="bg-ok-soft border border-ok-line px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-ok">
              <ShieldCheck className="w-4 h-4 text-ok" />
              <span>Live · @{profile?.username}</span>
            </div>
          ) : (
            <button
              onClick={() => setActiveTab('settings')}
              className="bg-warn-soft hover:bg-warn-soft border border-warn-line px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-warn transition-colors"
            >
              <Instagram className="w-4 h-4 text-warn" />
              <span>{connection ? 'Reconnect Instagram' : 'Connect Instagram'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Tabs Navigation */}
      {banner && (
        <div
          className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${
            banner.kind === 'error'
              ? 'bg-danger-soft border-danger-line text-danger'
              : banner.kind === 'success'
                ? 'bg-ok-soft border-ok-line text-ok'
                : 'bg-accent-soft border-accent-line text-accent-ink'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-bold break-words">{banner.message}</p>
            {banner.detail && <p className="text-[11px] opacity-80 break-words">{banner.detail}</p>}
          </div>
          <button onClick={() => setBanner(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      <TabNav
        tabs={[
          { id: 'content', label: 'Content', icon: Sparkles },
          { id: 'automation', label: 'DM Automation', icon: MessageSquare, count: dmRules.length },
          { id: 'analytics', label: 'Insights', icon: BarChart3 },
          { id: 'settings', label: 'Connection', icon: Settings }
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />


      {/* Tab 1: Reels & Feed Content Generator */}
      {activeTab === 'content' && (
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-7 space-y-6">
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-line pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blush" />
                  Instagram Visual Post Generator
                </h3>
                <div className="flex bg-sunk p-1 rounded-xl gap-1">
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
                        postType === t.id ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-ink-4">Post Concept or Reels Script Goal</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. 5 steps to double SaaS MRR using AI automation tools. Add a strong hook at the beginning and call to action at the end."
                  rows={3}
                  className="w-full px-4 py-3 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
                />
              </div>

              <button
                onClick={handleGenerateCaption}
                disabled={generating || !prompt.trim()}
                className="w-full py-2.5 bg-accent hover:opacity-95 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-warn-line" />}
                {generating ? 'Generating Caption & Hashtags...' : 'Generate Instagram Caption & Hashtags'}
              </button>

              {/* Caption Output */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold uppercase tracking-wider text-ink-4">Caption & First Comment</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-ink-4">First Comment Hashtags (Auto-Posted)</label>
                <input
                  type="text"
                  value={firstCommentHashtags}
                  onChange={(e) => setFirstCommentHashtags(e.target.value)}
                  className="w-full px-4 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink font-mono text-accent-ink"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Media Preview & Publish */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-line pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Instagram className="w-5 h-5 text-blush" />
                  Instagram Post Preview
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-blush-soft text-blush-ink px-2 py-0.5 rounded">
                  {postType}
                </span>
              </div>

              {/*
                Preview is locked to the aspect ratio Instagram will actually
                crop to, so what is shown here is what gets published: 9:16 for
                Reels and Stories, 4:5 for a feed post, 1:1 for a carousel.
              */}
              <PhoneFrame label={`${postType} · ${previewSurface === 'story' ? '9:16' : previewSurface === 'feed' ? '4:5' : '1:1'}`}>
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-line">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="h-7 w-7 shrink-0 rounded-full accent-thread p-[1.5px]">
                      <div className="grid h-full w-full place-items-center rounded-full bg-surface text-[10px] font-bold text-ink">
                        {brand?.name.charAt(0)}
                      </div>
                    </div>
                    <span className="truncate text-[11px] font-bold text-ink">
                      @{profile?.username || igHandle || 'not_connected'}
                    </span>
                  </div>
                  <MoreHorizontal className="h-4 w-4 shrink-0 text-ink-4" />
                </div>

                <MediaSlot
                  url={mediaUrl}
                  type={mediaType}
                  surface={previewSurface}
                  placeholder="Pick media below to preview the crop"
                />

                <div className="flex items-center gap-3.5 px-3 pt-2.5">
                  <Heart className="h-4.5 w-4.5 text-ink" />
                  <MessageCircle className="h-4.5 w-4.5 text-ink" />
                  <Send className="h-4.5 w-4.5 text-ink" />
                  <Bookmark className="ml-auto h-4.5 w-4.5 text-ink" />
                </div>

                <div className="space-y-1 px-3 py-2">
                  <p className="text-[11px] leading-snug text-ink">
                    <span className="mr-1.5 font-bold">
                      @{profile?.username || igHandle || 'not_connected'}
                    </span>
                    {caption || 'Your caption preview will appear here.'}
                  </p>
                  {firstCommentHashtags && (
                    <p className="text-[11px] leading-snug text-accent break-words">
                      {firstCommentHashtags}
                    </p>
                  )}
                </div>
              </PhoneFrame>

              {/* Media Vault Picker */}
              <div className="space-y-2 pt-2 border-t border-line">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Select Media for Instagram</div>
                <div className="grid grid-cols-4 gap-2">
                  {mediaAssets.slice(0, 4).map((a) => (
                    <div
                      key={a.id}
                      onClick={() => {
                        setMediaUrl(a.url);
                        setMediaType(a.type);
                      }}
                      className={`h-14 rounded-lg overflow-hidden border cursor-pointer ${
                        mediaUrl === a.url ? 'ring-2 ring-blush border-blush' : 'border-line'
                      }`}
                    >
                      {a.type === 'image' ? <img src={a.url} className="w-full h-full object-cover" /> : <video src={a.url} className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Publish for real through the Graph API */}
              <div className="space-y-2 pt-3 border-t border-line">
                <button
                  onClick={handlePublishToInstagram}
                  disabled={publishing || !connected || !mediaUrl}
                  className="w-full py-3 bg-accent hover:opacity-90 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {publishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {publishing
                    ? (postType === 'REELS' ? 'Uploading Reel to Instagram…' : 'Publishing to Instagram…')
                    : `Publish ${postType} to @${profile?.username || 'Instagram'}`}
                </button>

                {publishing && postType === 'REELS' && (
                  <p className="text-[11px] text-ink-3 text-center">
                    Instagram transcodes video before publishing — this can take a minute or two. Keep this tab open.
                  </p>
                )}

                {!connected && (
                  <button onClick={() => setActiveTab('settings')} className="w-full text-[11px] font-bold text-warn underline">
                    Connect an Instagram Business account first
                  </button>
                )}

                {publishResult?.permalink && (
                  <a
                    href={publishResult.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-[11px] font-bold text-blush-ink underline"
                  >
                    View the live post on Instagram
                  </a>
                )}
              </div>
            </div>

            {/* Publish history straight from the server's audit table */}
            {publications.length > 0 && (
              <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-3">Publish history</h4>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {publications.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-3 text-[11px] border-b border-line pb-2">
                      <div className="min-w-0">
                        <div className="font-bold text-ink-2">{p.mediaType}</div>
                        <div className="text-ink-3 truncate">{p.caption || '(no caption)'}</div>
                        {p.error && <div className="text-danger font-semibold">{p.error}</div>}
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full font-bold ${
                          p.status === 'PUBLISHED'
                            ? 'bg-ok-soft text-ok'
                            : p.status === 'FAILED'
                              ? 'bg-danger-soft text-danger'
                              : 'bg-warn-soft text-warn'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Instagram DM Automation Rules */}
      {activeTab === 'automation' && (
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-line pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-accent" />
                  Instagram DM Keyword Auto-Responder Workflows
                </h3>
                <p className="text-xs text-ink-3">Automatically reply to Instagram post comments and DMs containing target keywords with personalized links and lead capture forms.</p>
              </div>
            </div>

            {/* Create Rule Input Form */}
            <div className="bg-accent-soft/50 p-5 rounded-2xl border border-accent-line space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-accent-ink">Create New Keyword Auto-Reply Rule</h4>
              
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-2">Trigger Keyword</label>
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="e.g. PROMO, INFO, GUIDE"
                    className="w-full px-3.5 py-2 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink uppercase font-bold"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-ink-2">Automated DM Reply Message & Link</label>
                  <input
                    type="text"
                    value={newReplyMessage}
                    onChange={(e) => setNewReplyMessage(e.target.value)}
                    placeholder="e.g. Thanks for reaching out! Here is your exclusive 20% discount code: SAVE20. Link: https://..."
                    className="w-full px-3.5 py-2 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={captureEmail}
                    onChange={(e) => setCaptureEmail(e.target.checked)}
                    className="rounded text-accent focus:ring-accent"
                  />
                  Automatically capture user email in conversation
                </label>

                <button
                  onClick={handleAddDMRule}
                  disabled={!newKeyword.trim() || !newReplyMessage.trim()}
                  className="px-5 py-2 bg-accent hover:bg-accent text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Add DM Automation Rule
                </button>
              </div>
            </div>

            {/* Active Rules List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Active Keyword Automation Rules ({dmRules.length})</h4>
              <div className="space-y-3">
                {dmRules.length === 0 && (
                  <p className="text-xs text-ink-3 py-6 text-center border border-dashed border-line rounded-xl">
                    No keyword rules yet. Add one above — replies are sent automatically when Instagram delivers a matching DM.
                  </p>
                )}
                {dmRules.map((rule) => (
                  <div key={rule.id} className="p-4 bg-surface border border-line rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-accent-soft text-accent-ink text-xs font-bold rounded-md font-mono">
                          KEYWORD: "{rule.keyword}"
                        </span>
                        <span className="text-[10px] bg-ok-soft text-ok font-bold px-2 py-0.5 rounded">
                          {rule.status}
                        </span>
                      </div>
                      <p className="text-xs text-ink-2 font-medium">{rule.replyMessage}</p>
                    </div>

                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <div>
                        <div className="text-[10px] text-ink-4 font-bold uppercase">Triggered</div>
                        <div className="font-bold text-ink">{rule.triggeredCount} DMs</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ink-4 font-bold uppercase">Leads Captured</div>
                        <div className="font-bold text-accent">{rule.leadsCaptured} Leads</div>
                      </div>
                      <div>
                        <button
                          onClick={() => handleDeleteDMRule(rule.id)}
                          className="px-3 py-1.5 bg-sunk hover:bg-danger-soft hover:text-danger text-ink-2 text-[11px] font-bold rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Instagram Analytics — read live from the Graph API */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {!connected ? (
            <div className="bg-surface border border-line rounded-2xl p-12 text-center space-y-3">
              <p className="text-sm font-bold text-ink-2">Not connected to Instagram.</p>
              <p className="text-xs text-ink-3">Connect a Business account to see real reach, impressions and profile activity.</p>
              <button
                onClick={() => setActiveTab('settings')}
                className="px-4 py-2 bg-ink text-white text-xs font-bold rounded-xl"
              >
                Connect Instagram
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Followers</div>
                  <div className="text-2xl font-bold text-ink">{(profile?.followersCount ?? 0).toLocaleString()}</div>
                  <div className="text-[10px] text-ink-3 font-semibold">Live from the Graph API</div>
                </div>

                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Published posts</div>
                  <div className="text-2xl font-bold text-ink">{(profile?.mediaCount ?? 0).toLocaleString()}</div>
                  <div className="text-[10px] text-ink-3 font-semibold">On @{profile?.username}</div>
                </div>

                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Reach (30 days)</div>
                  <div className="text-2xl font-bold text-accent">
                    {insights?.reach ? Number(insights.reach.total).toLocaleString() : '—'}
                  </div>
                  <div className="text-[10px] text-ink-3 font-semibold">
                    {insights?.reach ? 'Accounts reached' : 'Not reported for this account'}
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Impressions (30 days)</div>
                  <div className="text-2xl font-bold text-blush">
                    {insights?.impressions ? Number(insights.impressions.total).toLocaleString() : '—'}
                  </div>
                  <div className="text-[10px] text-ink-3 font-semibold">
                    {insights?.impressions ? 'Total views' : 'Not reported for this account'}
                  </div>
                </div>
              </div>

              {recentMedia.length > 0 && (
                <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blush" />
                    Recent posts and their real engagement
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentMedia.slice(0, 6).map((m) => (
                      <a
                        key={m.id}
                        href={m.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-line rounded-xl overflow-hidden hover:border-blush-line transition-colors"
                      >
                        <div className="h-32 bg-sunk">
                          {(m.thumbnailUrl || m.mediaUrl) && (
                            <img src={m.thumbnailUrl || m.mediaUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="p-3 space-y-1">
                          <p className="text-[11px] text-ink-3 line-clamp-2">{m.caption || '(no caption)'}</p>
                          <div className="flex items-center gap-3 text-[11px] font-bold text-ink-2">
                            <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-danger" /> {m.likeCount}</span>
                            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-accent" /> {m.commentsCount}</span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 4: Live connection */}
      {activeTab === 'settings' && (
        <div className="bg-surface border border-line rounded-2xl p-8 shadow-sm max-w-2xl mx-auto space-y-6">
          <div className="border-b border-line pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Instagram className="w-5 h-5 text-blush" />
                Instagram Business API Connection
              </h3>
              <p className="text-xs text-ink-3">
                Your token is verified with Meta and stored encrypted on the server, never in the browser.
              </p>
            </div>
            {savedSuccess && (
              <span className="text-xs bg-ok-soft text-ok font-bold px-3 py-1 rounded-full border border-ok-line">
                Connected
              </span>
            )}
          </div>

          {connection && (
            <div className={`rounded-xl border p-4 ${connected ? 'bg-ok-soft border-ok-line' : 'bg-danger-soft border-danger-line'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {profile?.profilePictureUrl && (
                    <img src={profile.profilePictureUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                  )}
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-ink">
                      {connected ? `@${profile?.username}` : 'Connection needs attention'}
                    </div>
                    {connected && profile && (
                      <div className="text-[11px] text-ink-3">
                        {profile.followersCount.toLocaleString()} followers · {profile.mediaCount.toLocaleString()} posts
                      </div>
                    )}
                    <div className="text-[11px] text-ink-3 font-mono">
                      {connection.externalId} · token {connection.tokenPreview}
                    </div>
                    {connection.lastError && (
                      <div className="text-[11px] text-danger font-semibold">{connection.lastError}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 bg-surface hover:bg-sunk border border-line-strong text-ink-2 text-[11px] font-bold rounded-lg shrink-0"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}

          {!webhooksConfigured && (
            <div className="rounded-xl border border-warn-line bg-warn-soft p-4 text-[11px] text-warn space-y-1">
              <p className="font-bold">DM automation is inactive.</p>
              <p>
                Keyword rules are saved, but Instagram cannot notify this app until webhooks are configured. Set{' '}
                <span className="font-mono">META_APP_SECRET</span> and{' '}
                <span className="font-mono">META_WEBHOOK_VERIFY_TOKEN</span> on the server, then subscribe your Meta app
                to the <span className="font-mono">messages</span> and <span className="font-mono">comments</span> fields.
              </p>
            </div>
          )}

          {oauthConfigured && (
            <button
              onClick={handleOAuthConnect}
              disabled={connecting}
              className="w-full py-3 bg-accent hover:opacity-90 disabled:opacity-60 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Instagram className="w-4 h-4" />
              {connecting ? 'Waiting for Meta…' : 'Connect with Instagram (OAuth)'}
            </button>
          )}

          <div className="space-y-4">
            <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wide">
              {oauthConfigured ? 'Or connect with an access token' : 'Connect with an access token'}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ink-2">Facebook Page access token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAA…"
                className="w-full px-4 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink font-mono"
              />
              <p className="text-[11px] text-ink-3">
                Needs <span className="font-mono">instagram_basic</span>,{' '}
                <span className="font-mono">instagram_content_publish</span> and{' '}
                <span className="font-mono">pages_show_list</span>. Your Instagram account must be a Business or Creator
                account linked to a Facebook Page — that is a Meta requirement for publishing via the API.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ink-2">
                Instagram Business account ID <span className="font-normal text-ink-4">(optional — discovered automatically)</span>
              </label>
              <input
                type="text"
                value={igAccountId}
                onChange={(e) => setIgAccountId(e.target.value)}
                placeholder="17841400000000000"
                className="w-full px-4 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink font-mono"
              />
            </div>

            <button
              onClick={handleConnectAccount}
              disabled={connecting || !accessToken.trim()}
              className="w-full py-3 bg-ink hover:bg-ink-2 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-ok" />
              {connecting ? 'Verifying with Meta…' : 'Verify & connect Instagram account'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
