import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBrands, getBrandById, Brand } from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import { 
  Bot, Target, Users, Layers, Sparkles, AlertTriangle, CheckCircle2, 
  ArrowRight, Globe, ShieldCheck, PenTool, ExternalLink, RefreshCw, ChevronRight, Settings
} from 'lucide-react';

export function BrandStrategy() {
  const navigate = useNavigate();
  const { brandId } = useParams();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'site' | 'competitors' | 'audience' | 'pillars'>('site');

  useEffect(() => {
    const fetchBrand = async () => {
      setLoading(true);
      try {
        const idToLoad = brandId || localStorage.getItem('activeBrandId');
        if (idToLoad) {
          const b = await getBrandById(idToLoad);
          if (b) {
            setBrand(b);
            localStorage.setItem('activeBrandId', b.id);
            setLoading(false);
            return;
          }
        }

        const all = await getBrands();
        if (all.length > 0) {
          setBrand(all[0]);
          localStorage.setItem('activeBrandId', all[0].id);
        }
      } catch (err) {
        console.error("Error loading brand strategy:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBrand();
  }, [brandId]);

  if (loading) return <div className="p-8 font-sans text-ink-3">Loading Brand Strategy & Intelligence...</div>;

  const research = brand?.agentResearchData || null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-ink bg-sunk border border-line px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-ok" />
              Brand Intelligence & Strategy Hub
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {brand ? `${brand.name} Strategy Blueprint` : 'Brand Strategy Hub'}
          </h1>
          <p className="text-ink-3 mt-1">Review saved brand positioning, competitor research, target ICP, and content pillars from your AI workforce.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BrandSelector
            activeBrandId={brand?.id}
            onBrandChange={(selected) => {
              setBrand(selected);
              localStorage.setItem('activeBrandId', selected.id);
            }}
          />
          <button
            onClick={() => navigate('/agents')}
            className="px-4 py-2 bg-ink text-white text-xs font-bold rounded-xl hover:bg-ink-2 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Bot className="w-4 h-4 text-warn" />
            Launch AI Agents Studio
          </button>
        </div>
      </header>

      {/* Brand Summary Card */}
      {brand && (
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-sunk border border-line flex items-center justify-center overflow-hidden shrink-0">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain" />
              ) : (
                <span className="text-2xl font-bold text-ink-4">{brand.name.charAt(0)}</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                {brand.name}
                {research ? (
                  <span className="text-xs bg-ok-soft text-ok font-semibold px-2.5 py-0.5 rounded-full border border-ok-line">AI Strategy Ready</span>
                ) : (
                  <span className="text-xs bg-warn-soft text-warn font-semibold px-2.5 py-0.5 rounded-full border border-warn-line">Needs AI Scan</span>
                )}
              </h2>
              <div className="flex items-center gap-3 text-xs text-ink-3 mt-1">
                {brand.websiteUrl && (
                  <a href={brand.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-ink">
                    <Globe className="w-3.5 h-3.5" /> {brand.websiteUrl}
                  </a>
                )}
                {brand.industry && <span>• Industry: {brand.industry}</span>}
                {brand.brandTone && <span>• Tone: {brand.brandTone}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/brand-setup/${brand.id}`)}
              className="px-3.5 py-2 bg-sunk hover:bg-line text-ink-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              Edit Brand Setup
            </button>
            <button
              onClick={() => navigate('/generate')}
              className="px-3.5 py-2 bg-ink hover:bg-ink-2 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
            >
              <PenTool className="w-3.5 h-3.5" />
              Generate Content
            </button>
          </div>
        </div>
      )}

      {/* How To Use Guidance Banner */}
      <div className="bg-accent text-white rounded-2xl p-6 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-warn" />
            <h3 className="font-bold text-sm text-white">How to Use Your AI Strategy Hub</h3>
          </div>
          <p className="text-xs text-white/75 max-w-2xl leading-relaxed">
            Every insight below is connected to your content pipeline. Click <span className="font-bold text-white">“Use Insight in Studio”</span> on any persona, competitor gap, or content pillar to auto-generate social posts, paid ad campaigns, or video scripts tailored to this brand strategy.
          </p>
        </div>

        <button
          onClick={() => navigate('/generate')}
          className="px-4 py-2 bg-surface text-ink font-bold text-xs rounded-xl hover:bg-sunk transition-all flex items-center gap-1.5 shrink-0 text-nowrap"
        >
          <PenTool className="w-3.5 h-3.5" />
          Open Content Studio
        </button>
      </div>

      {/* Strategy Hub Main Tabs */}
      {!research ? (
        <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-warn-soft rounded-full flex items-center justify-center mx-auto text-warn">
            <Bot className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-ink">No AI Strategy Saved Yet</h3>
          <p className="text-sm text-ink-3 max-w-lg mx-auto">
            Run your 6 autonomous agents in the Agent Workforce Studio to automatically analyze your site, research top competitors, profile target ICPs, and define strategic content pillars.
          </p>
          <button
            onClick={() => navigate('/agents')}
            className="px-6 py-3 bg-ink text-white font-bold rounded-xl text-xs hover:bg-ink-2 transition-all inline-flex items-center gap-2 shadow-md"
          >
            <Bot className="w-4 h-4 text-warn" /> Run AI Agent Workforce Now
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tabs Control */}
          <div className="flex flex-wrap bg-sunk p-1.5 rounded-2xl border border-line gap-1">
            <button
              onClick={() => setActiveTab('site')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'site' ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <Globe className="w-4 h-4 text-accent" />
              1. Core Messaging & Voice
            </button>
            <button
              onClick={() => setActiveTab('competitors')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'competitors' ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <Target className="w-4 h-4 text-ok" />
              2. Competitors & Market Gaps
            </button>
            <button
              onClick={() => setActiveTab('audience')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'audience' ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <Users className="w-4 h-4 text-accent" />
              3. Target Audience & ICP
            </button>
            <button
              onClick={() => setActiveTab('pillars')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'pillars' ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <Layers className="w-4 h-4 text-warn" />
              4. Content Pillars & Blueprint
            </button>
          </div>

          {/* Tab 1: Core Messaging & Voice */}
          {activeTab === 'site' && (
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <Globe className="w-5 h-5 text-accent" />
                    Site Analysis & Core Brand Positioning
                  </h3>
                  <p className="text-xs text-ink-3">Key value propositions, voice tone, and high-performing content hooks extracted by Agent 1.</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('draftTopic', `Core Positioning: ${research.siteAnalysis?.valueProposition || brand?.name}`);
                    navigate('/generate');
                  }}
                  className="px-3.5 py-2 bg-ink text-white text-xs font-bold rounded-xl hover:bg-ink-2 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 text-nowrap"
                >
                  <PenTool className="w-3.5 h-3.5 text-warn" />
                  Generate Post with Voice
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Core Value Proposition</h4>
                  <p className="text-xs font-semibold text-ink bg-sunk p-4 rounded-xl border border-line leading-relaxed">
                    {research.siteAnalysis?.valueProposition || 'Not analyzed yet'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Brand Voice & Personality</h4>
                  <p className="text-xs font-semibold text-ink bg-sunk p-4 rounded-xl border border-line leading-relaxed">
                    {research.siteAnalysis?.brandVoice || 'Not analyzed yet'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Key Product / Service Offerings</h4>
                <div className="flex flex-wrap gap-2">
                  {(research.siteAnalysis?.keyOfferings || []).map((offering: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-sunk text-ink rounded-lg text-xs font-semibold border border-line">
                      {offering}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Primary Content Hooks</h4>
                <div className="space-y-2">
                  {(research.siteAnalysis?.primaryHooks || []).map((hook: string, i: number) => (
                    <div key={i} className="p-3 bg-accent-soft/60 rounded-xl border border-accent-line text-xs font-medium text-accent-ink flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-accent shrink-0" />
                      <span>{hook}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Competitor Intelligence & Market Gaps */}
          {activeTab === 'competitors' && (
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <Target className="w-5 h-5 text-ok" />
                    Competitor Intelligence & Market Gaps
                  </h3>
                  <p className="text-xs text-ink-3">Industry rivals, underserved market angles, and differentiation strategies mapped by Agent 2.</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('draftTopic', `Market Gap Strategy: ${research.competitorAnalysis?.recommendedDifferentiation || 'Competitor Gap'}`);
                    navigate('/generate');
                  }}
                  className="px-3.5 py-2 bg-ink text-white text-xs font-bold rounded-xl hover:bg-ink-2 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 text-nowrap"
                >
                  <PenTool className="w-3.5 h-3.5 text-ok" />
                  Target Market Gap
                </button>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Identified Industry Competitors</h4>
                <div className="flex flex-wrap gap-2">
                  {(research.competitorAnalysis?.topCompetitors || []).map((comp: string, i: number) => (
                    <span key={i} className="px-3.5 py-1.5 bg-ok-soft text-ok rounded-lg text-xs font-semibold border border-ok-line">
                      {comp}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Content Gaps & Opportunities</h4>
                  <div className="space-y-2">
                    {(research.competitorAnalysis?.contentGapsAndOpportunities || []).map((gap: string, i: number) => (
                      <div key={i} className="p-3 bg-sunk rounded-xl border border-line text-xs text-ink-2 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                        <span>{gap}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Recommended Differentiation Angle</h4>
                  <p className="text-xs font-semibold text-ink bg-sunk p-4 rounded-xl border border-line leading-relaxed">
                    {research.competitorAnalysis?.recommendedDifferentiation || 'Not analyzed yet'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Target Audience & ICP */}
          {activeTab === 'audience' && (
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <Users className="w-5 h-5 text-accent" />
                    Target Audience Profiling & ICP
                  </h3>
                  <p className="text-xs text-ink-3">Demographic personas, core friction points, and customer transformation goals profiled by Agent 3.</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('draftTopic', `Audience Persona Campaign: ${research.audienceProfile?.primaryICP || 'Target Audience'}`);
                    navigate('/generate');
                  }}
                  className="px-3.5 py-2 bg-ink text-white text-xs font-bold rounded-xl hover:bg-ink-2 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 text-nowrap"
                >
                  <PenTool className="w-3.5 h-3.5 text-accent" />
                  Generate Persona Campaign
                </button>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Primary Ideal Customer Profile (ICP)</h4>
                <p className="text-xs font-semibold text-ink bg-accent-soft/50 p-4 rounded-xl border border-accent-line leading-relaxed">
                  {research.audienceProfile?.primaryICP || 'Not profiled yet'}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-danger">Core Audience Pain Points</h4>
                  <div className="space-y-2">
                    {(research.audienceProfile?.painPoints || []).map((pain: string, i: number) => (
                      <div key={i} className="p-3 bg-danger-soft/60 rounded-xl border border-danger-line text-xs font-medium text-danger flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                        <span>{pain}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ok">Key Desires & Transformation Goals</h4>
                  <div className="space-y-2">
                    {(research.audienceProfile?.desiresAndGoals || []).map((goal: string, i: number) => (
                      <div key={i} className="p-3 bg-ok-soft/60 rounded-xl border border-ok-line text-xs font-medium text-ok flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" />
                        <span>{goal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Content Pillars & Blueprint */}
          {activeTab === 'pillars' && (
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <Layers className="w-5 h-5 text-warn" />
                    Strategic Content Pillars & Blueprint
                  </h3>
                  <p className="text-xs text-ink-3">Core content pillars, campaign themes, and hashtag strategies formulated by Agent 4.</p>
                </div>
                <button
                  onClick={() => {
                    const pillarTitle = research.marketingStrategy?.contentPillars?.[0]?.title || 'Content Pillar';
                    localStorage.setItem('draftTopic', `Content Pillar Strategy: ${pillarTitle}`);
                    navigate('/generate');
                  }}
                  className="px-3.5 py-2 bg-ink text-white text-xs font-bold rounded-xl hover:bg-ink-2 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 text-nowrap"
                >
                  <PenTool className="w-3.5 h-3.5 text-warn" />
                  Generate Posts for Pillar
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {(research.marketingStrategy?.contentPillars || []).map((pillar: any, i: number) => (
                  <div key={i} className="p-5 rounded-2xl border border-line bg-sunk space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-ink text-sm">{pillar.title}</div>
                      <button
                        onClick={() => {
                          localStorage.setItem('draftTopic', `Content Pillar: ${pillar.title} - ${pillar.description}`);
                          navigate('/generate');
                        }}
                        className="px-2.5 py-1 bg-surface hover:bg-ink hover:text-white text-ink-2 text-[11px] font-bold rounded-lg border border-line transition-all flex items-center gap-1 shrink-0 text-nowrap"
                      >
                        <PenTool className="w-3 h-3 text-warn" /> Use Pillar
                      </button>
                    </div>
                    <p className="text-xs text-ink-3 leading-relaxed">{pillar.description}</p>
                    <div className="pt-2 border-t border-line">
                      <div className="text-[10px] font-bold text-ink-4 uppercase">Example Topics:</div>
                      <ul className="text-xs text-ink-2 space-y-1 mt-1 font-medium">
                        {(pillar.exampleTopics || []).map((t: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <ChevronRight className="w-3 h-3 text-warn shrink-0" /> {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-line">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Campaign Concepts</h4>
                  <div className="space-y-1.5">
                    {(research.marketingStrategy?.campaignConcepts || []).map((concept: string, i: number) => (
                      <div key={i} className="p-2.5 bg-sunk rounded-lg border border-line text-xs font-semibold text-ink">
                        {concept}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4">Hashtag & CTA Strategy</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(research.marketingStrategy?.hashtagStrategy || []).map((tag: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-sunk text-ink-2 text-xs font-mono rounded-md border border-line">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
