import React, { useEffect, useState } from 'react';
import { getBrands, getBrandById, getSavedTrends, getMediaAssets, Brand, SavedTrend, MediaAsset } from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Calendar, PenTool, Settings, BarChart3, TrendingUp, Bot, Sparkles, Bookmark, Film, Folder, Layers, Globe, ShieldCheck, Megaphone, Instagram, MessageSquare, Cpu, UserCheck 
} from 'lucide-react';

export function Dashboard() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  // Widget States
  const [savedTrends, setSavedTrends] = useState<SavedTrend[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);

  const loadBrandData = async (brandId?: string) => {
    try {
      const activeBrandId = brandId || localStorage.getItem('activeBrandId');
      let brandData = null;

      if (activeBrandId) {
        brandData = await getBrandById(activeBrandId);
      }

      if (!brandData) {
        const allBrands = await getBrands();
        if (allBrands.length > 0) {
          brandData = allBrands[0];
          localStorage.setItem('activeBrandId', brandData.id);
        }
      }

      if (brandData) {
        setBrand(brandData);

        // Load Trends & Media Assets for this brand
        const allTrends = getSavedTrends();
        setSavedTrends(allTrends.filter(t => !t.brandId || t.brandId === brandData.id));

        const allMedia = getMediaAssets();
        setMediaAssets(allMedia.filter(m => !m.brandId || m.brandId === brandData.id));
      }
    } catch (error) {
      console.error("Error fetching brand for dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrandData();

    // Listen to activeBrandChanged event from top navbar BrandSelector
    const handleBrandChange = (e: any) => {
      if (e.detail) {
        setBrand(e.detail);
        loadBrandData(e.detail.id);
      }
    };

    window.addEventListener('activeBrandChanged', handleBrandChange);
    return () => {
      window.removeEventListener('activeBrandChanged', handleBrandChange);
    };
  }, []);

  if (loading) {
    return <div className="p-8 font-sans text-ink-3 animate-pulse">Loading WotSocial Dashboard...</div>;
  }

  const research = brand?.agentResearchData || null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Dashboard</h1>
          <p className="text-ink-3 mt-1">Overview of {brand?.name || 'your brand'} performance, strategy, trends, and digital assets.</p>
        </div>

        <div className="flex items-center gap-3">
          <BrandSelector
            activeBrandId={brand?.id}
            onBrandChange={(selected) => {
              setBrand(selected);
              localStorage.setItem('activeBrandId', selected.id);
              loadBrandData(selected.id);
            }}
          />
        </div>
      </header>

      {!brand ? (
        <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-sunk rounded-full flex items-center justify-center mx-auto text-ink-4">
            <Settings className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-ink">Setup Your Brand</h2>
          <p className="text-sm text-ink-3 max-w-md mx-auto">
            Before we can generate content, WotSocial needs to understand your brand's tone, personality, and guidelines.
          </p>
          <Link
            to="/brand-setup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-white font-bold rounded-xl text-xs hover:bg-ink-2 transition-colors shadow-md"
          >
            Start Brand Setup <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Left Column: Brand Overview & Strategy Hub Widget */}
          <div className="md:col-span-5 space-y-6">
            
            {/* Active Brand Details Card */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Active Brand Profile</span>
                {brand.logoUrl && (
                  <img src={brand.logoUrl} alt="Logo" className="w-7 h-7 object-contain rounded" />
                )}
              </div>

              <div className="text-2xl font-bold text-ink">{brand.name}</div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 bg-sunk p-3 rounded-xl border border-line">
                  <div>
                    <div className="text-ink-4 font-medium">Industry</div>
                    <div className="font-semibold text-ink-2 truncate">{brand.industry || 'General'}</div>
                  </div>
                  <div>
                    <div className="text-ink-4 font-medium">Category</div>
                    <div className="font-semibold text-ink-2 truncate">{brand.category || 'SaaS & Tech'}</div>
                  </div>
                </div>

                <div className="bg-sunk p-3 rounded-xl border border-line">
                  <div className="text-ink-4 font-medium">Tone & Personality</div>
                  <div className="font-semibold text-ink-2">{brand.brandTone || 'Professional & Engaging'}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-line flex items-center justify-between">
                <Link to={`/brand-setup/${brand.id}`} className="text-xs font-semibold text-ink hover:underline inline-flex items-center gap-1">
                  Edit Brand Settings <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Brand Strategy Hub Widget */}
            <div className="bg-accent text-white rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-surface/10 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-accent" />
                  <h3 className="font-bold text-sm text-white">Brand Strategy Hub</h3>
                </div>
                {research ? (
                  <span className="text-[10px] bg-ok/20 text-ok-line border border-ok/30 px-2.5 py-0.5 rounded-full font-bold">Strategy Ready</span>
                ) : (
                  <span className="text-[10px] bg-warn/20 text-warn-line border border-warn/30 px-2.5 py-0.5 rounded-full font-bold">Needs AI Scan</span>
                )}
              </div>

              <p className="text-xs text-ink-4 leading-relaxed">
                {research?.siteAnalysis?.valueProposition 
                  ? `"${research.siteAnalysis.valueProposition.slice(0, 110)}..."`
                  : 'Run AI Agents to extract brand positioning, competitor gaps, audience ICP, and content pillars.'}
              </p>

              <button
                onClick={() => navigate(`/brand-strategy/${brand.id}`)}
                className="w-full py-2.5 bg-surface hover:bg-sunk text-ink text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Layers className="w-3.5 h-3.5 text-accent" /> Open Strategy Hub
              </button>
            </div>

            {/* AI Video Studio Widget */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-accent" />
                  <h3 className="font-bold text-sm text-ink">AI Video Studio</h3>
                </div>
                <span className="text-[10px] bg-accent-soft text-accent-ink font-bold px-2 py-0.5 rounded">4K Cinematic</span>
              </div>
              <p className="text-xs text-ink-3">Render 60s video promo scripts and Reels using Veo, SeeDance, and OpenArt engines.</p>
              <button
                onClick={() => navigate('/video-studio')}
                className="w-full py-2.5 bg-ink hover:bg-ink-2 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Film className="w-3.5 h-3.5 text-accent" /> Generate AI Video
              </button>
            </div>

          </div>

          {/* Right Column: Main Modules & Media/Trends Widgets */}
          <div className="md:col-span-7 space-y-6">
            
            {/* Agent Workforce Hero Banner */}
            <Link to="/agents" className="bg-ink text-white rounded-2xl p-6 shadow-md hover:bg-ink transition-all group block border border-ink-2">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-surface/10 rounded-2xl flex items-center justify-center text-white shrink-0">
                  <Bot className="w-6 h-6 text-warn" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-surface/15 text-ink-4 px-2.5 py-0.5 rounded border border-surface/10">6 Autonomous AI Agents</span>
                    <Sparkles className="w-3.5 h-3.5 text-warn" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Agentic Workflow Studio</h3>
                  <p className="text-xs text-ink-4 leading-relaxed">
                    Deploy autonomous AI agents to crawl {brand.name}, track competitors, profile target ICPs, and schedule posts.
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-ink-4 group-hover:text-white group-hover:translate-x-1 transition-transform shrink-0 mt-2" />
              </div>
            </Link>

            {/* Saved Trends Vault Widget Card */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-5 h-5 text-warn fill-warn" />
                  <h3 className="font-bold text-sm text-ink">Saved Trends Vault</h3>
                </div>
                <span className="text-xs font-bold text-ink-3 bg-sunk px-2.5 py-0.5 rounded-full">{savedTrends.length} Saved</span>
              </div>

              {savedTrends.length === 0 ? (
                <div className="p-4 bg-sunk rounded-xl text-center text-xs text-ink-3">
                  No saved trends for {brand.name} yet. Explore viral topics in Content Studio to bookmark them here.
                </div>
              ) : (
                <div className="space-y-2">
                  {savedTrends.slice(0, 2).map((t) => (
                    <div key={t.id} className="p-3 bg-sunk rounded-xl border border-line flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-ink truncate">{t.title}</span>
                      <span className="text-[10px] bg-accent-soft text-accent-ink px-2 py-0.5 rounded font-bold shrink-0">{t.type}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => navigate('/trends-vault')}
                className="w-full py-2 bg-sunk hover:bg-line text-ink-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <Bookmark className="w-3.5 h-3.5 text-warn" /> Explore Trends Vault
              </button>
            </div>

            {/* Media Library Widget Card */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Folder className="w-5 h-5 text-accent" />
                  <h3 className="font-bold text-sm text-ink">Digital Media Assets</h3>
                </div>
                <span className="text-xs font-bold text-ink-3 bg-sunk px-2.5 py-0.5 rounded-full">{mediaAssets.length} Assets</span>
              </div>

              {mediaAssets.length === 0 ? (
                <div className="p-4 bg-sunk rounded-xl text-center text-xs text-ink-3">
                  Upload brand logos, product photos, or AI graphics to populate your persistent media library.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {mediaAssets.slice(0, 4).map((a) => (
                    <div key={a.id} className="h-16 bg-sunk rounded-xl overflow-hidden border border-line">
                      {a.type === 'image' ? (
                        <img src={a.url} alt={a.title} className="w-full h-full object-cover" />
                      ) : (
                        <video src={a.url} className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => navigate('/media-library')}
                className="w-full py-2 bg-sunk hover:bg-line text-ink-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <Folder className="w-3.5 h-3.5 text-accent" /> Manage Media Library
              </button>
            </div>

            {/* Multi-Channel & Lead CRM Quick Links Grid */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Link to="/meta-ads" className="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:border-accent/40 transition-colors group">
                <div className="w-9 h-9 bg-accent-soft text-accent rounded-xl flex items-center justify-center mb-2.5 group-hover:bg-accent group-hover:text-white transition-colors">
                  <Megaphone className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink mb-1">Meta Ads</h3>
                <p className="text-[10px] text-ink-3 leading-snug">FB & IG ads.</p>
              </Link>

              <Link to="/leads" className="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:border-ok/40 transition-colors group">
                <div className="w-9 h-9 bg-ok-soft text-ok rounded-xl flex items-center justify-center mb-2.5 group-hover:bg-accent group-hover:text-white transition-colors">
                  <UserCheck className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink mb-1">Leads CRM</h3>
                <p className="text-[10px] text-ink-3 leading-snug">Ad leads ingest.</p>
              </Link>

              <Link to="/instagram-marketing" className="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:border-blush/40 transition-colors group">
                <div className="w-9 h-9 bg-blush-soft text-blush rounded-xl flex items-center justify-center mb-2.5 group-hover:bg-blush group-hover:text-white transition-colors">
                  <Instagram className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink mb-1">Instagram</h3>
                <p className="text-[10px] text-ink-3 leading-snug">Reels & DMs.</p>
              </Link>

              <Link to="/whatsapp-marketing" className="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:border-ok/40 transition-colors group">
                <div className="w-9 h-9 bg-ok-soft text-ok rounded-xl flex items-center justify-center mb-2.5 group-hover:bg-accent group-hover:text-white transition-colors">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink mb-1">WhatsApp</h3>
                <p className="text-[10px] text-ink-3 leading-snug">HSM broadcasts.</p>
              </Link>

              <Link to="/mcp-connector" className="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:border-accent/40 transition-colors group">
                <div className="w-9 h-9 bg-accent-soft text-accent rounded-xl flex items-center justify-center mb-2.5 group-hover:bg-accent group-hover:text-white transition-colors">
                  <Cpu className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink mb-1">Claude MCP</h3>
                <p className="text-[10px] text-ink-3 leading-snug">Claude image ingest.</p>
              </Link>

              <Link to="/schedule" className="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:border-ink/30 transition-colors group">
                <div className="w-9 h-9 bg-sunk rounded-xl flex items-center justify-center mb-2.5 group-hover:bg-ink group-hover:text-white transition-colors">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink mb-1">Schedule</h3>
                <p className="text-[10px] text-ink-3 leading-snug">Calendar grid.</p>
              </Link>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
