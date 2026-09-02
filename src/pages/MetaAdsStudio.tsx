import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getBrands, getBrandById, Brand, MetaAdAccount, MetaCampaign,
  getMediaAssets, MediaAsset
} from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import {
  metaApi, getOAuthStatus, startOAuth, runOAuthPopup, describeError,
  IntegrationError, PublicConnection, LiveMetaCampaign
} from '../services/integrationsApi';
import { generatePaidAdCampaign } from '../services/adService';
import { 
  Megaphone, Sparkles, Settings, BarChart3, Play, Pause, RefreshCw, CheckCircle2, 
  AlertTriangle, DollarSign, Target, Eye, MousePointer, ShieldCheck, Globe, 
  Layers, Upload, Image as ImageIcon, Video, ExternalLink, Plus, Copy, Check, ArrowRight,
  TrendingUp, Activity, Filter, Info, UserCheck
} from 'lucide-react';
import { format } from 'date-fns';

export function MetaAdsStudio() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'generator' | 'builder' | 'analytics' | 'settings'>('generator');

  // Meta Account & Connection State
  const [metaAccount, setMetaAccount] = useState<MetaAdAccount | null>(null);
  const [adAccountId, setAdAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [pageId, setPageId] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [instagramAccountId, setInstagramAccountId] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Natural Language Ad Copy Generator State
  const [nlPrompt, setNlPrompt] = useState('');
  const [generatingAd, setGeneratingAd] = useState(false);

  // Advanced Meta Campaign Parameters
  const [campaignName, setCampaignName] = useState('');
  const [objective, setObjective] = useState<MetaCampaign['objective']>('OUTCOME_LEADS');
  const [specialCategory, setSpecialCategory] = useState<MetaCampaign['specialAdCategory']>('NONE');
  const [buyingType, setBuyingType] = useState<MetaCampaign['buyingType']>('AUCTION');
  const [dailyBudget, setDailyBudget] = useState(25);
  const [lifetimeBudget, setLifetimeBudget] = useState(0);

  // Ad Set Parameters
  const [adSetName, setAdSetName] = useState('');
  const [conversionLocation, setConversionLocation] = useState<MetaCampaign['adSetDetails']['conversionLocation']>('WEBSITE');
  const [optimizationGoal, setOptimizationGoal] = useState<MetaCampaign['adSetDetails']['optimizationGoal']>('CONVERSIONS');
  const [targetAgeMin, setTargetAgeMin] = useState(18);
  const [targetAgeMax, setTargetAgeMax] = useState(65);
  const [targetGenders, setTargetGenders] = useState<string[]>(['all']);
  const [locations, setLocations] = useState<string[]>(['United States', 'Canada', 'United Kingdom']);
  const [detailedInterests, setDetailedInterests] = useState<string[]>(['Digital Marketing', 'Entrepreneurship', 'SaaS']);
  const [placements, setPlacements] = useState<string[]>(['feed', 'stories', 'reels', 'right_column']);

  // Ad Creative Parameters
  const [adName, setAdName] = useState('');
  const [primaryText, setPrimaryText] = useState('');
  const [primaryTextVariations, setPrimaryTextVariations] = useState<string[]>([]);
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [callToAction, setCallToAction] = useState<MetaCampaign['adDetails']['callToAction']>('LEARN_MORE');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [destinationUrl, setDestinationUrl] = useState('https://example.com/landing-page');
  const [utmSource, setUtmSource] = useState('meta');
  const [utmMedium, setUtmMedium] = useState('cpc');
  const [utmCampaign, setUtmCampaign] = useState('q3_lead_gen');

  // Campaigns & Analytics State
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [publishing, setPublishing] = useState(false);

  // Live connection state — replaces the previous sandbox auto-seeding.
  const [connection, setConnection] = useState<PublicConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [accountSummary, setAccountSummary] = useState<{ name?: string; currency?: string; timezone?: string } | null>(null);
  const [discovered, setDiscovered] = useState<{ adAccounts: any[]; pages: any[] } | null>(null);
  const [pixels, setPixels] = useState<any[]>([]);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success' | 'info'; message: string; detail?: string } | null>(null);
  const [launchResult, setLaunchResult] = useState<{ campaignId: string; reviewUrl: string; status: string; warnings: string[] } | null>(null);
  const [activateOnLaunch, setActivateOnLaunch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState('USD');

  /** Maps a live Meta campaign onto the shape the table already renders. */
  const toDisplayCampaign = (c: LiveMetaCampaign): MetaCampaign => ({
    id: c.id,
    brandId: c.brandId,
    name: c.name,
    objective: c.objective as MetaCampaign['objective'],
    specialAdCategory: (c.specialAdCategory || 'NONE') as MetaCampaign['specialAdCategory'],
    buyingType: (c.buyingType || 'AUCTION') as MetaCampaign['buyingType'],
    status: (c.effectiveStatus === 'ACTIVE' ? 'ACTIVE' : c.status) as MetaCampaign['status'],
    dailyBudget: c.dailyBudget,
    lifetimeBudget: c.lifetimeBudget,
    spent: c.spent,
    impressions: c.impressions,
    clicks: c.clicks,
    conversions: c.conversions,
    ctr: c.ctr,
    cpc: c.cpc,
    cpa: c.cpa,
    roas: c.roas,
    startDate: c.startDate,
    endDate: c.endDate,
    adSetDetails: c.adSetDetails || {
      name: '—', conversionLocation: 'WEBSITE', optimizationGoal: 'LINK_CLICKS',
      targetAgeMin: 18, targetAgeMax: 65, targetGenders: [], locations: [],
      detailedInterests: [], placements: []
    },
    adDetails: c.adDetails || {
      name: '—', primaryText: '', headline: '', description: '',
      callToAction: 'LEARN_MORE', destinationUrl: ''
    },
    createdAt: c.createdAt
  });

  /** Pulls campaigns and their insights live from the Marketing API. */
  const refreshCampaigns = async (brandId: string, silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await metaApi.campaigns(brandId);
      setCampaigns(res.campaigns.map(toDisplayCampaign));
      setCurrency(res.currency || 'USD');
    } catch (err) {
      if (err instanceof IntegrationError && err.notConnected) {
        setCampaigns([]);
      } else {
        setBanner({ kind: 'error', message: `Could not load campaigns from Meta: ${describeError(err)}` });
      }
    } finally {
      setRefreshing(false);
    }
  };

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

      getOAuthStatus().then(s => setOauthConfigured(s.configured)).catch(() => setOauthConfigured(false));

      // Ask the server whether this brand has a live, verified Meta connection.
      const connRes = await metaApi.connection(currentBrand.id);
      setConnected(connRes.connected);
      setConnection(connRes.connection);

      if (connRes.connection) {
        setAdAccountId(connRes.connection.externalId);
        setPageId(connRes.connection.metadata?.pageId || '');
        setPixelId(connRes.connection.metadata?.pixelId || '');
        setInstagramAccountId(connRes.connection.metadata?.instagramActorId || '');
        setAccountSummary({
          name: connRes.connection.name,
          currency: connRes.connection.metadata?.currency,
          timezone: connRes.connection.metadata?.timezone
        });
        if (!connRes.connected) {
          setBanner({
            kind: 'error',
            message: connRes.connection.lastError || 'The stored Meta token is no longer valid. Reconnect the account.'
          });
        }
      } else {
        setAccountSummary(null);
      }

      if (connRes.connected) {
        await refreshCampaigns(currentBrand.id, true);
        metaApi.pixels(currentBrand.id).then(r => setPixels(r.pixels)).catch(() => setPixels([]));
      } else {
        setCampaigns([]);
      }

      const assets = getMediaAssets().filter(a => !a.brandId || a.brandId === currentBrand?.id);
      setMediaAssets(assets);
      if (assets.length > 0 && !mediaUrl) {
        setMediaUrl(assets[0].url);
        setMediaType(assets[0].type);
      }
    } catch (err) {
      setBanner({ kind: 'error', message: `Failed to load the Meta Ads Studio: ${describeError(err)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleBrandChange = (e: any) => {
      if (e.detail) {
        loadData(e.detail.id);
      }
    };
    window.addEventListener('activeBrandChanged', handleBrandChange);
    return () => window.removeEventListener('activeBrandChanged', handleBrandChange);
  }, []);

  /** Lists what a pasted token can reach, so the right ad account is chosen. */
  const handleDiscoverAssets = async () => {
    if (!accessToken.trim()) {
      setBanner({ kind: 'error', message: 'Paste a Meta access token first.' });
      return;
    }
    setConnecting(true);
    setBanner(null);
    try {
      const res = await metaApi.discover(accessToken.trim());
      setDiscovered(res);
      if (!res.adAccounts.length) {
        setBanner({ kind: 'error', message: 'This token cannot reach any ad accounts. Check that it has the ads_management permission.' });
      } else {
        if (!adAccountId) setAdAccountId(res.adAccounts[0].id);
        if (!pageId && res.pages.length) setPageId(res.pages[0].id);
        setBanner({ kind: 'success', message: `Found ${res.adAccounts.length} ad account(s) and ${res.pages.length} Page(s) on this token.` });
      }
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setConnecting(false);
    }
  };

  /** Verifies the token against Meta and stores it encrypted, server-side. */
  const handleConnectMetaAccount = async () => {
    if (!brand) return;
    if (!accessToken.trim() || !adAccountId.trim()) {
      setBanner({ kind: 'error', message: 'An access token and an ad account ID are both required.' });
      return;
    }
    setConnecting(true);
    setBanner(null);
    try {
      const res = await metaApi.connect({
        brandId: brand.id,
        accessToken: accessToken.trim(),
        adAccountId: adAccountId.trim(),
        pageId: pageId.trim() || undefined,
        pixelId: pixelId.trim() || undefined,
        instagramAccountId: instagramAccountId.trim() || undefined
      });

      setConnection(res.connection);
      setConnected(true);
      setAccountSummary({ name: res.account.name, currency: res.account.currency, timezone: res.account.timezone });
      // The raw token now lives only on the server, encrypted.
      setAccessToken('');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      setBanner({
        kind: 'success',
        message: `Connected to ${res.account.name} (${res.account.currency}). Token verified with Meta.`
      });
      await refreshCampaigns(brand.id);
      metaApi.pixels(brand.id).then(r => setPixels(r.pixels)).catch(() => {});
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
      const { url } = await startOAuth(brand.id, 'meta_ads');
      const result = await runOAuthPopup(url);
      if (result.success) {
        setBanner({ kind: 'success', message: 'Meta account connected.' });
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
      await metaApi.disconnect(brand.id);
      setConnection(null);
      setConnected(false);
      setCampaigns([]);
      setAccountSummary(null);
      setBanner({ kind: 'info', message: 'Meta account disconnected. Stored credentials were deleted.' });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  /** Real AI copy generation, using the configured Gemini or Claude key. */
  const handleGenerateAdFromNL = async () => {
    if (!nlPrompt.trim() || !brand) return;
    setGeneratingAd(true);
    setBanner(null);

    try {
      const provider = (localStorage.getItem('claude_api_key') || '').trim() ? 'claude' : 'gemini';
      if (!(localStorage.getItem('gemini_api_key') || '').trim() && provider === 'gemini') {
        throw new Error('No AI key configured. Add a Gemini or Claude API key in Integrations to generate ad copy.');
      }

      const pkg = await generatePaidAdCampaign({
        productOrOffer: nlPrompt.trim(),
        brand,
        targetObjective: objective.replace('OUTCOME_', ''),
        destinationUrl: destinationUrl || brand.websiteUrl || 'https://example.com',
        provider
      });

      const meta = pkg.metaAd;
      setPrimaryText(meta.primaryTextShort || meta.primaryTextLong);
      setPrimaryTextVariations([meta.primaryTextShort, meta.primaryTextLong].filter(Boolean));
      setHeadline(meta.headline);
      setDescription(meta.description);
      setCallToAction(
        (meta.ctaButton === 'Shop Now' ? 'SHOP_NOW'
          : meta.ctaButton === 'Sign Up' ? 'SIGN_UP'
          : meta.ctaButton === 'Get Offer' ? 'GET_OFFER'
          : meta.ctaButton === 'Contact Us' ? 'CONTACT_US'
          : 'LEARN_MORE') as MetaCampaign['adDetails']['callToAction']
      );
      if (meta.metaTargeting?.interests?.length) setDetailedInterests(meta.metaTargeting.interests);
      setCampaignName(`${brand.name} — ${nlPrompt.slice(0, 30)}`);
      setAdSetName(`${nlPrompt.slice(0, 25)} — Interest Audience`);
      setAdName(`${nlPrompt.slice(0, 25)} — Creative`);
      setActiveTab('builder');
    } catch (err) {
      setBanner({ kind: 'error', message: `Ad copy generation failed: ${describeError(err)}` });
    } finally {
      setGeneratingAd(false);
    }
  };

  /**
   * Launches the campaign on Meta for real: campaign → ad set → creative → ad.
   * Created PAUSED unless "activate immediately" is explicitly ticked, because
   * an active campaign starts spending budget straight away.
   */
  const handlePublishCampaign = async () => {
    if (!brand || !campaignName.trim()) return;
    if (!connected) {
      setBanner({ kind: 'error', message: 'Connect a Meta ad account before launching a campaign.' });
      setActiveTab('settings');
      return;
    }

    setPublishing(true);
    setBanner(null);
    setLaunchResult(null);

    try {
      const res = await metaApi.launchCampaign({
        brandId: brand.id,
        name: campaignName.trim(),
        objective,
        specialAdCategory: specialCategory,
        buyingType,
        dailyBudget: dailyBudget > 0 ? dailyBudget : undefined,
        lifetimeBudget: lifetimeBudget > 0 ? lifetimeBudget : undefined,
        activate: activateOnLaunch,
        pageId: pageId || undefined,
        pixelId: pixelId || undefined,
        adSet: {
          name: adSetName || `${campaignName} — Ad Set`,
          conversionLocation,
          optimizationGoal,
          targetAgeMin,
          targetAgeMax,
          targetGenders,
          locations,
          detailedInterests,
          placements
        },
        ad: {
          name: adName || `${campaignName} — Ad`,
          primaryText,
          headline,
          description,
          callToAction,
          mediaUrl,
          mediaType,
          destinationUrl,
          utmSource,
          utmMedium,
          utmCampaign,
          instagramActorId: instagramAccountId || undefined
        }
      });

      setLaunchResult({
        campaignId: res.campaignId,
        reviewUrl: res.reviewUrl,
        status: res.status,
        warnings: res.targetingWarnings || []
      });
      setBanner({
        kind: 'success',
        message: res.activated
          ? `Campaign ${res.campaignId} is LIVE on Meta and now spending budget.`
          : `Campaign ${res.campaignId} created on Meta as PAUSED. Review it, then activate to start spending.`,
        detail: (res.targetingWarnings || []).join(' ')
      });

      await refreshCampaigns(brand.id);
      setActiveTab('analytics');
    } catch (err) {
      const detail = err instanceof IntegrationError && err.details?.created
        ? `Objects created before the failure were rolled back: ${JSON.stringify(err.details.created)}`
        : undefined;
      setBanner({ kind: 'error', message: `Campaign launch failed: ${describeError(err)}`, detail });
    } finally {
      setPublishing(false);
    }
  };

  /** Pauses or resumes the campaign on Meta, along with its ad set and ad. */
  const handleToggleStatus = async (id: string, currentStatus: MetaCampaign['status']) => {
    if (!brand) return;
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

    if (nextStatus === 'ACTIVE' && !window.confirm(
      'Activating this campaign will start delivering ads and spending your Meta budget. Continue?'
    )) return;

    const previous = campaigns;
    setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: nextStatus } : c));

    try {
      await metaApi.setStatus(id, brand.id, nextStatus);
      setBanner({ kind: 'success', message: `Campaign ${id} set to ${nextStatus} on Meta.` });
    } catch (err) {
      setCampaigns(previous); // Meta rejected it; do not show a state that is not real.
      setBanner({ kind: 'error', message: `Could not change status: ${describeError(err)}` });
    }
  };

  if (loading) return <div className="p-8 font-sans text-gray-500 animate-pulse">Loading Meta Marketing & Ads Studio...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Megaphone className="w-3.5 h-3.5" />
              Meta Ads Manager Integration
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Meta Marketing & Ads Studio</h1>
          <p className="text-gray-500 mt-1">Create natural language ad copy, configure advanced Meta parameters, publish to Meta Ads Manager, and capture real-time ad performance analytics.</p>
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

          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <span className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800 shadow-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Live · {accountSummary?.name || adAccountId}</span>
              </span>
            ) : (
              <button
                onClick={() => setActiveTab('settings')}
                className="bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-amber-900 transition-colors"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>{connection ? 'Reconnect Meta account' : 'Connect Meta ad account'}</span>
              </button>
            )}

            {connected && (
              <button
                onClick={() => brand && refreshCampaigns(brand.id)}
                disabled={refreshing}
                className="bg-white border border-gray-200 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Syncing…' : 'Sync from Meta'}
              </button>
            )}
          </div>
        </div>
      </header>

      {banner && (
        <div
          className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${
            banner.kind === 'error'
              ? 'bg-red-50 border-red-200 text-red-900'
              : banner.kind === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          {banner.kind === 'error'
            ? <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            : <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-bold break-words">{banner.message}</p>
            {banner.detail && <p className="text-[11px] opacity-80 break-words">{banner.detail}</p>}
            {launchResult && banner.kind === 'success' && (
              <a
                href={launchResult.reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold underline inline-flex items-center gap-1"
              >
                Open in Meta Ads Manager <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <button onClick={() => setBanner(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Studio Navigation Tabs */}
      <div className="flex flex-wrap bg-gray-100 p-1.5 rounded-2xl border border-gray-200 gap-1">
        <button
          onClick={() => setActiveTab('generator')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'generator' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          1. Natural Language Ad Copy Studio
        </button>

        <button
          onClick={() => setActiveTab('builder')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'builder' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-400" />
          2. Advanced Meta Campaign & Ad Set Builder
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'analytics' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          3. Live Meta Ads Analytics & Reporting ({campaigns.length})
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'settings' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Settings className="w-4 h-4 text-purple-400" />
          4. Meta Account & Pixel Settings
        </button>
      </div>

      {/* Tab 1: Natural Language Ad Copy & Creative Studio */}
      {activeTab === 'generator' && (
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-7 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Natural Language Meta Ad Generator
                </h3>
                <p className="text-xs text-gray-500">Describe your product, promotional offer, or target goal in natural language. WotSocial AI will automatically generate Meta primary texts, headlines, CTAs, and recommended audience parameters.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Describe Campaign Intent or Promotional Prompt</label>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder="e.g. Create a high-converting Facebook and Instagram ad campaign for our B2B SaaS platform offering a 14-day free trial. Target marketing managers and agency owners looking for AI automation."
                  rows={4}
                  className="w-full px-4 py-3 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Quick Prompts:</span>
                {[
                  "Free Trial Lead Generation for SaaS",
                  "E-commerce Summer Sale 20% Off",
                  "High-Ticket B2B Strategy Session Booking",
                  "App Install Campaign with Video Hook"
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setNlPrompt(prompt)}
                    className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 text-[11px] font-medium rounded-lg border border-gray-200 transition-colors"
                  >
                    + {prompt}
                  </button>
                ))}
              </div>

              <button
                onClick={handleGenerateAdFromNL}
                disabled={generatingAd || !nlPrompt.trim()}
                className="w-full py-3 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {generatingAd ? <RefreshCw className="w-4 h-4 animate-spin text-amber-400" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
                {generatingAd ? 'Generating Meta Ad Copy & Parameters...' : 'Generate High-Converting Ad Campaign Copy'}
              </button>
            </div>

            {/* Generated Variations */}
            {primaryTextVariations.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">AI Generated Primary Text Copy Variations</h4>
                <div className="space-y-3">
                  {primaryTextVariations.map((text, i) => (
                    <div
                      key={i}
                      onClick={() => setPrimaryText(text)}
                      className={`p-4 rounded-xl border text-xs leading-relaxed cursor-pointer transition-all ${
                        primaryText === text ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Variation {i + 1}</span>
                        {primaryText === text && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                      </div>
                      <p className="text-gray-900 font-medium">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Ad Creative & Media Asset Selector */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-blue-600" />
                  Meta Visual Ad Creative Media
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  {mediaAssets.length} Assets in Vault
                </span>
              </div>

              {/* Selected Media Preview */}
              <div className="relative h-56 bg-gray-900 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center">
                {mediaUrl ? (
                  mediaType === 'video' ? (
                    <video src={mediaUrl} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={mediaUrl} alt="Ad Media" className="w-full h-full object-cover" />
                  )
                ) : (
                  <div className="text-center text-gray-400 text-xs p-4">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Select visual creative from Media Vault or enter image URL below.
                  </div>
                )}
                <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-black/80 text-white px-2 py-0.5 rounded">
                  {mediaType}
                </span>
              </div>

              {/* Media URL Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Media Asset URL</label>
                <input
                  type="text"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              {/* Select from Media Vault */}
              {mediaAssets.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Choose from Digital Media Vault</div>
                  <div className="grid grid-cols-4 gap-2">
                    {mediaAssets.slice(0, 8).map((asset) => (
                      <div
                        key={asset.id}
                        onClick={() => {
                          setMediaUrl(asset.url);
                          setMediaType(asset.type);
                        }}
                        className={`h-14 rounded-lg overflow-hidden border cursor-pointer transition-all relative ${
                          mediaUrl === asset.url ? 'ring-2 ring-black border-black' : 'border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {asset.type === 'image' ? (
                          <img src={asset.url} alt={asset.title} className="w-full h-full object-cover" />
                        ) : (
                          <video src={asset.url} className="w-full h-full object-cover" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setActiveTab('builder')}
                className="w-full py-2.5 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                Proceed to Campaign Configuration <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Advanced Meta Campaign & Ad Set Builder */}
      {activeTab === 'builder' && (
        <div className="space-y-8">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-gray-100 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  Meta Ads Manager Parameters & Specs Configuration
                </h3>
                <p className="text-xs text-gray-500">Configure exact Meta campaign specifications matching Meta Ads Manager 1:1 including CBO budgets, conversion locations, placements, and UTM parameters.</p>
              </div>

              <div className="flex flex-col items-stretch gap-2 shrink-0">
                <button
                  onClick={handlePublishCampaign}
                  disabled={publishing || !campaignName.trim() || !connected}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  {publishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                  {publishing
                    ? 'Creating on Meta…'
                    : activateOnLaunch ? 'Launch LIVE campaign on Meta' : 'Create campaign on Meta (paused)'}
                </button>

                {/* An active campaign spends real budget, so this is opt-in. */}
                <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activateOnLaunch}
                    onChange={(e) => setActivateOnLaunch(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Activate immediately (starts spending budget)
                </label>

                {!connected && (
                  <button onClick={() => setActiveTab('settings')} className="text-[11px] font-bold text-amber-700 underline">
                    Connect a Meta ad account first
                  </button>
                )}
              </div>
            </div>

            {/* Section 1: Campaign Level Parameters */}
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px]">1</span>
                Campaign Level Specifications
              </h4>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-gray-700">Campaign Name</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. Brand Growth - High Intent Leads Q3"
                    className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Buying Type</label>
                  <select
                    value={buyingType}
                    onChange={(e) => setBuyingType(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    <option value="AUCTION">Auction (Recommended)</option>
                    <option value="RESERVATION">Reservation / Reach & Frequency</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Campaign Objective</label>
                  <select
                    value={objective}
                    onChange={(e) => setObjective(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    <option value="OUTCOME_LEADS">Leads (Collect Forms & Sign-ups)</option>
                    <option value="OUTCOME_SALES">Sales / Conversions (Direct Purchases)</option>
                    <option value="OUTCOME_TRAFFIC">Traffic (Website Clicks)</option>
                    <option value="OUTCOME_ENGAGEMENT">Engagement (Comments, Shares, Likes)</option>
                    <option value="OUTCOME_AWARENESS">Awareness (Brand Reach)</option>
                    <option value="OUTCOME_APP_PROMOTION">App Promotion (Installs)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Special Ad Category</label>
                  <select
                    value={specialCategory}
                    onChange={(e) => setSpecialCategory(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    <option value="NONE">None (Standard Products/Services)</option>
                    <option value="CREDIT">Credit / Financial Offers</option>
                    <option value="EMPLOYMENT">Employment / Hiring</option>
                    <option value="HOUSING">Housing / Real Estate</option>
                    <option value="ISSUES_ELECTIONS_POLITICS">Social Issues / Elections</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Advantage+ Daily Budget ($)</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      value={dailyBudget}
                      onChange={(e) => setDailyBudget(Number(e.target.value))}
                      className="w-full pl-9 pr-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-semibold"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Ad Set Level Parameters */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-600 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-[10px]">2</span>
                Ad Set & Targeting Specifications
              </h4>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Ad Set Name</label>
                  <input
                    type="text"
                    value={adSetName}
                    onChange={(e) => setAdSetName(e.target.value)}
                    placeholder="e.g. US & CA - Tech Enthusiasts AdSet"
                    className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Conversion Location</label>
                  <select
                    value={conversionLocation}
                    onChange={(e) => setConversionLocation(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    <option value="WEBSITE">Website (Meta Pixel Tracking)</option>
                    <option value="MESSENGER">Messenger Direct</option>
                    <option value="INSTAGRAM_DIRECT">Instagram Direct DM</option>
                    <option value="CALLS">Phone Calls</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Optimization for Delivery</label>
                  <select
                    value={optimizationGoal}
                    onChange={(e) => setOptimizationGoal(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    <option value="CONVERSIONS">Conversions (Highest ROI)</option>
                    <option value="LINK_CLICKS">Link Clicks</option>
                    <option value="LANDING_PAGE_VIEWS">Landing Page Views</option>
                    <option value="IMPRESSIONS">Impressions</option>
                  </select>
                </div>
              </div>

              {/* Demographics & Detailed Targeting */}
              <div className="grid md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-800">Target Age & Demographics</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={targetAgeMin}
                      onChange={(e) => setTargetAgeMin(Number(e.target.value))}
                      className="w-20 px-3 py-1.5 text-xs border border-gray-300 rounded-lg outline-none"
                    />
                    <span className="text-xs text-gray-500">to</span>
                    <input
                      type="number"
                      value={targetAgeMax}
                      onChange={(e) => setTargetAgeMax(Number(e.target.value))}
                      className="w-20 px-3 py-1.5 text-xs border border-gray-300 rounded-lg outline-none"
                    />
                    <span className="text-xs font-semibold text-gray-700">Years Old</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-800">Detailed Meta Interest Keywords</label>
                  <input
                    type="text"
                    value={detailedInterests.join(', ')}
                    onChange={(e) => setDetailedInterests(e.target.value.split(',').map(s => s.trim()))}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg outline-none"
                  />
                </div>
              </div>

              {/* Meta Placements */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">Meta Advantage+ Network Placements</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'feed', label: 'Facebook & Instagram Feeds' },
                    { id: 'stories', label: 'Stories & Reels Overlay' },
                    { id: 'reels', label: 'Instagram Reels Video' },
                    { id: 'right_column', label: 'Desktop Right Column' }
                  ].map((p) => (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={placements.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) setPlacements([...placements, p.id]);
                          else setPlacements(placements.filter(item => item !== p.id));
                        }}
                        className="rounded text-black focus:ring-black"
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 3: Ad Level Parameters & UTM Builder */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px]">3</span>
                Ad Level Creative Copy & UTM Specifications
              </h4>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Ad Creative Name</label>
                  <input
                    type="text"
                    value={adName}
                    onChange={(e) => setAdName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Call To Action Button</label>
                  <select
                    value={callToAction}
                    onChange={(e) => setCallToAction(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    <option value="LEARN_MORE">Learn More (High Converting)</option>
                    <option value="SHOP_NOW">Shop Now (E-commerce)</option>
                    <option value="SIGN_UP">Sign Up (SaaS & Services)</option>
                    <option value="BOOK_NOW">Book Now (Consultations)</option>
                    <option value="CONTACT_US">Contact Us</option>
                    <option value="GET_OFFER">Get Offer</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Primary Ad Text (Facebook & Instagram Caption)</label>
                <textarea
                  value={primaryText}
                  onChange={(e) => setPrimaryText(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black leading-relaxed"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Headline (Title on Ad Card)</label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Description (Sub-headline)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              {/* UTM Tracking Builder */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-blue-600" /> Destination URL & UTM Tracking Parameters
                </div>
                <div className="grid md:grid-cols-4 gap-3">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Landing Page URL</label>
                    <input
                      type="text"
                      value={destinationUrl}
                      onChange={(e) => setDestinationUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">utm_source</label>
                    <input
                      type="text"
                      value={utmSource}
                      onChange={(e) => setUtmSource(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">utm_campaign</label>
                    <input
                      type="text"
                      value={utmCampaign}
                      onChange={(e) => setUtmCampaign(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Live Meta Ads Reporting & Analytics Dashboard */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Key Metrics Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Spend</div>
              <div className="text-2xl font-bold text-gray-900">
                ${campaigns.reduce((acc, c) => acc + c.spent, 0).toFixed(2)}
              </div>
              <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> Live Meta Graph API
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Impressions</div>
              <div className="text-2xl font-bold text-gray-900">
                {campaigns.reduce((acc, c) => acc + c.impressions, 0).toLocaleString()}
              </div>
              <div className="text-[10px] text-gray-500 font-semibold">
                {campaigns.reduce((acc, c) => acc + c.clicks, 0).toLocaleString()} Total Clicks
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Avg Click-Through Rate</div>
              <div className="text-2xl font-bold text-emerald-600">
                {(campaigns.length > 0 ? campaigns.reduce((acc, c) => acc + c.ctr, 0) / campaigns.length : 0).toFixed(2)}%
              </div>
              <div className="text-[10px] text-gray-500 font-semibold">Industry Benchmark: 1.5%</div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Avg Return on Ad Spend</div>
              <div className="text-2xl font-bold text-purple-600">
                {(campaigns.length > 0 ? campaigns.reduce((acc, c) => acc + c.roas, 0) / campaigns.length : 4.85).toFixed(2)}x
              </div>
              <div className="text-[10px] text-purple-700 font-semibold">High Performing Campaign</div>
            </div>
          </div>

          {/* Campaigns Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm space-y-4">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Meta Ads Manager Active Campaigns
                </h3>
                <p className="text-xs text-gray-500">
                  {connected
                    ? `Read live from the Meta Marketing API for ${accountSummary?.name || adAccountId}. Amounts in ${currency}.`
                    : 'Not connected to Meta — there is nothing to report yet.'}
                </p>
              </div>

              <button
                onClick={() => setActiveTab('builder')}
                className="px-4 py-2 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 text-amber-400" /> Create New Meta Campaign
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-800">
                <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold tracking-wider text-gray-500">
                  <tr>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Campaign Name & Objective</th>
                    <th className="px-6 py-3">Budget</th>
                    <th className="px-6 py-3">Spend</th>
                    <th className="px-6 py-3">Impressions</th>
                    <th className="px-6 py-3">Clicks / CTR</th>
                    <th className="px-6 py-3">Conversions / CPA</th>
                    <th className="px-6 py-3">ROAS</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                        {connected ? (
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-700">No campaigns in this ad account yet.</p>
                            <p className="text-[11px]">Build one in the Campaign Builder tab — it will be created on Meta for real.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-700">Not connected to Meta.</p>
                            <button
                              onClick={() => setActiveTab('settings')}
                              className="text-[11px] font-bold text-blue-700 underline"
                            >
                              Connect an ad account to see live performance
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  {campaigns.map((camp) => (
                    <tr key={camp.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          camp.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {camp.status}
                        </span>
                      </td>

                      <td className="px-6 py-4 space-y-0.5">
                        <div className="font-bold text-gray-900 text-xs">{camp.name}</div>
                        <div className="text-[10px] text-gray-400">{camp.objective} • {camp.adSetDetails?.conversionLocation || '—'}</div>
                      </td>

                      <td className="px-6 py-4 font-semibold">${camp.dailyBudget}/day</td>
                      <td className="px-6 py-4 font-bold text-gray-900">${camp.spent.toFixed(2)}</td>
                      <td className="px-6 py-4">{camp.impressions.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <div>{camp.clicks} Clicks</div>
                        <div className="text-[10px] text-emerald-600 font-bold">{camp.ctr}% CTR</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{camp.conversions} Conversions</div>
                        <div className="text-[10px] text-gray-500">${camp.cpa.toFixed(2)} CPA</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-purple-600">{camp.roas}x</td>

                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => navigate(`/leads?campaign=${encodeURIComponent(camp.name)}`)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-bold rounded-lg transition-colors inline-flex items-center gap-1 border border-blue-200"
                        >
                          <UserCheck className="w-3 h-3 text-blue-600" /> View Leads
                        </button>

                        <button
                          onClick={() => handleToggleStatus(camp.id, camp.status)}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-[11px] font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          {camp.status === 'ACTIVE' ? <Pause className="w-3 h-3 text-amber-600" /> : <Play className="w-3 h-3 text-emerald-600" />}
                          {camp.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Live Meta connection */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-600" />
                Meta Marketing API Connection
              </h3>
              <p className="text-xs text-gray-500">
                Your token is verified against Meta, then encrypted and stored on the server. It is never kept in the browser.
              </p>
            </div>
            {savedSuccess && (
              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected
              </span>
            )}
          </div>

          {connection && (
            <div className={`rounded-xl border p-4 ${connected ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-gray-900 flex items-center gap-2">
                    {connected
                      ? <><ShieldCheck className="w-4 h-4 text-emerald-600" /> Live connection verified</>
                      : <><AlertTriangle className="w-4 h-4 text-red-600" /> Connection needs attention</>}
                  </div>
                  <div className="text-[11px] text-gray-600 font-mono">
                    {accountSummary?.name || connection.name} · {connection.externalId}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Token {connection.tokenPreview}
                    {accountSummary?.currency ? ` · ${accountSummary.currency}` : ''}
                    {connection.lastVerifiedAt ? ` · verified ${new Date(connection.lastVerifiedAt).toLocaleString()}` : ''}
                  </div>
                  {connection.lastError && (
                    <div className="text-[11px] text-red-700 font-semibold">{connection.lastError}</div>
                  )}
                </div>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-[11px] font-bold rounded-lg"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}

          {oauthConfigured && (
            <button
              onClick={handleOAuthConnect}
              disabled={connecting}
              className="w-full py-3 bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {connecting ? 'Waiting for Meta…' : 'Connect with Facebook (OAuth)'}
            </button>
          )}

          <div className="space-y-4">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              {oauthConfigured ? 'Or connect with a system-user token' : 'Connect with a system-user access token'}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Meta access token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAA…"
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
              />
              <p className="text-[11px] text-gray-500">
                Needs <span className="font-mono">ads_management</span>, <span className="font-mono">ads_read</span> and{' '}
                <span className="font-mono">pages_show_list</span>. Generate one in Business Settings → System Users.
              </p>
            </div>

            <button
              onClick={handleDiscoverAssets}
              disabled={connecting || !accessToken.trim()}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-800 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
              Look up ad accounts and Pages on this token
            </button>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Ad account ID</label>
              {discovered?.adAccounts?.length ? (
                <select
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
                >
                  {discovered.adAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name} — {a.id} ({a.currency})</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  placeholder="act_1092837465"
                  className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
                />
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Facebook Page ID (required for creatives)</label>
                {discovered?.pages?.length ? (
                  <select
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
                  >
                    <option value="">Select a Page…</option>
                    {discovered.pages.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.id}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    placeholder="102938475610293"
                    className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Meta Pixel (for conversion optimisation)</label>
                {pixels.length ? (
                  <select
                    value={pixelId}
                    onChange={(e) => setPixelId(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
                  >
                    <option value="">No pixel</option>
                    {pixels.map((px: any) => (
                      <option key={px.id} value={px.id}>{px.name} — {px.id}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={pixelId}
                    onChange={(e) => setPixelId(e.target.value)}
                    placeholder="1234567890"
                    className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
                  />
                )}
              </div>
            </div>

            <button
              onClick={handleConnectMetaAccount}
              disabled={connecting || !accessToken.trim() || !adAccountId.trim()}
              className="w-full py-3 bg-black hover:bg-gray-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {connecting ? 'Verifying with Meta…' : 'Verify & connect ad account'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
