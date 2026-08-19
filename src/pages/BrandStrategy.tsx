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

  if (loading) return <div className="p-8 font-sans text-gray-500">Loading Brand Strategy & Intelligence...</div>;

  const research = brand?.agentResearchData || null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-black bg-gray-100 border border-gray-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Brand Intelligence & Strategy Hub
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            {brand ? `${brand.name} Strategy Blueprint` : 'Brand Strategy Hub'}
          </h1>
          <p className="text-gray-500 mt-1">Review saved brand positioning, competitor research, target ICP, and content pillars from your AI workforce.</p>
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
            className="px-4 py-2 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Bot className="w-4 h-4 text-amber-400" />
            Launch AI Agents Studio
          </button>
        </div>
      </header>

      {/* Brand Summary Card */}
      {brand && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain" />
              ) : (
                <span className="text-2xl font-bold text-gray-400">{brand.name.charAt(0)}</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {brand.name}
                {research ? (
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">AI Strategy Ready</span>
                ) : (
                  <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2.5 py-0.5 rounded-full border border-amber-200">Needs AI Scan</span>
                )}
              </h2>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                {brand.websiteUrl && (
                  <a href={brand.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-black">
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
              className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              Edit Brand Setup
            </button>
            <button
              onClick={() => navigate('/generate')}
              className="px-3.5 py-2 bg-black hover:bg-gray-800 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
            >
              <PenTool className="w-3.5 h-3.5" />
              Generate Content
            </button>
          </div>
        </div>
      )}

      {/* How To Use Guidance Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-black to-purple-900 text-white rounded-2xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm text-white">How to Use Your AI Strategy Hub</h3>
          </div>
          <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
            Every insight below is connected to your content pipeline. Click <span className="text-amber-300 font-bold">"Use Insight in Studio"</span> on any persona, competitor gap, or content pillar to auto-generate social posts, paid ad campaigns, or video scripts tailored to this brand strategy.
          </p>
        </div>

        <button
          onClick={() => navigate('/generate')}
          className="px-4 py-2 bg-white text-black font-bold text-xs rounded-xl hover:bg-gray-100 transition-all flex items-center gap-1.5 shrink-0 text-nowrap"
        >
          <PenTool className="w-3.5 h-3.5" />
          Open Content Studio
        </button>
      </div>

      {/* Strategy Hub Main Tabs */}
      {!research ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500">
            <Bot className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">No AI Strategy Saved Yet</h3>
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            Run your 6 autonomous agents in the Agent Workforce Studio to automatically analyze your site, research top competitors, profile target ICPs, and define strategic content pillars.
          </p>
          <button
            onClick={() => navigate('/agents')}
            className="px-6 py-3 bg-black text-white font-bold rounded-xl text-xs hover:bg-gray-800 transition-all inline-flex items-center gap-2 shadow-md"
          >
            <Bot className="w-4 h-4 text-amber-400" /> Run AI Agent Workforce Now
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tabs Control */}
          <div className="flex flex-wrap bg-gray-100 p-1.5 rounded-2xl border border-gray-200 gap-1">
            <button
              onClick={() => setActiveTab('site')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'site' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Globe className="w-4 h-4 text-blue-500" />
              1. Core Messaging & Voice
            </button>
            <button
              onClick={() => setActiveTab('competitors')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'competitors' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Target className="w-4 h-4 text-emerald-500" />
              2. Competitors & Market Gaps
            </button>
            <button
              onClick={() => setActiveTab('audience')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'audience' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4 text-purple-500" />
              3. Target Audience & ICP
            </button>
            <button
              onClick={() => setActiveTab('pillars')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'pillars' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Layers className="w-4 h-4 text-amber-500" />
              4. Content Pillars & Blueprint
            </button>
          </div>

          {/* Tab 1: Core Messaging & Voice */}
          {activeTab === 'site' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-500" />
                    Site Analysis & Core Brand Positioning
                  </h3>
                  <p className="text-xs text-gray-500">Key value propositions, voice tone, and high-performing content hooks extracted by Agent 1.</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('draftTopic', `Core Positioning: ${research.siteAnalysis?.valueProposition || brand?.name}`);
                    navigate('/generate');
                  }}
                  className="px-3.5 py-2 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 text-nowrap"
                >
                  <PenTool className="w-3.5 h-3.5 text-amber-400" />
                  Generate Post with Voice
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Core Value Proposition</h4>
                  <p className="text-xs font-semibold text-gray-900 bg-gray-50 p-4 rounded-xl border border-gray-200 leading-relaxed">
                    {research.siteAnalysis?.valueProposition || 'Not analyzed yet'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Brand Voice & Personality</h4>
                  <p className="text-xs font-semibold text-gray-900 bg-gray-50 p-4 rounded-xl border border-gray-200 leading-relaxed">
                    {research.siteAnalysis?.brandVoice || 'Not analyzed yet'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Key Product / Service Offerings</h4>
                <div className="flex flex-wrap gap-2">
                  {(research.siteAnalysis?.keyOfferings || []).map((offering: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-900 rounded-lg text-xs font-semibold border border-gray-200">
                      {offering}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Primary Content Hooks</h4>
                <div className="space-y-2">
                  {(research.siteAnalysis?.primaryHooks || []).map((hook: string, i: number) => (
                    <div key={i} className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs font-medium text-blue-900 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{hook}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Competitor Intelligence & Market Gaps */}
          {activeTab === 'competitors' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Target className="w-5 h-5 text-emerald-500" />
                    Competitor Intelligence & Market Gaps
                  </h3>
                  <p className="text-xs text-gray-500">Industry rivals, underserved market angles, and differentiation strategies mapped by Agent 2.</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('draftTopic', `Market Gap Strategy: ${research.competitorAnalysis?.recommendedDifferentiation || 'Competitor Gap'}`);
                    navigate('/generate');
                  }}
                  className="px-3.5 py-2 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 text-nowrap"
                >
                  <PenTool className="w-3.5 h-3.5 text-emerald-400" />
                  Target Market Gap
                </button>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Identified Industry Competitors</h4>
                <div className="flex flex-wrap gap-2">
                  {(research.competitorAnalysis?.topCompetitors || []).map((comp: string, i: number) => (
                    <span key={i} className="px-3.5 py-1.5 bg-emerald-50 text-emerald-900 rounded-lg text-xs font-semibold border border-emerald-200">
                      {comp}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Content Gaps & Opportunities</h4>
                  <div className="space-y-2">
                    {(research.competitorAnalysis?.contentGapsAndOpportunities || []).map((gap: string, i: number) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <span>{gap}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Recommended Differentiation Angle</h4>
                  <p className="text-xs font-semibold text-gray-900 bg-gray-50 p-4 rounded-xl border border-gray-200 leading-relaxed">
                    {research.competitorAnalysis?.recommendedDifferentiation || 'Not analyzed yet'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Target Audience & ICP */}
          {activeTab === 'audience' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-500" />
                    Target Audience Profiling & ICP
                  </h3>
                  <p className="text-xs text-gray-500">Demographic personas, core friction points, and customer transformation goals profiled by Agent 3.</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('draftTopic', `Audience Persona Campaign: ${research.audienceProfile?.primaryICP || 'Target Audience'}`);
                    navigate('/generate');
                  }}
                  className="px-3.5 py-2 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 text-nowrap"
                >
                  <PenTool className="w-3.5 h-3.5 text-purple-400" />
                  Generate Persona Campaign
                </button>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Primary Ideal Customer Profile (ICP)</h4>
                <p className="text-xs font-semibold text-gray-900 bg-purple-50/50 p-4 rounded-xl border border-purple-100 leading-relaxed">
                  {research.audienceProfile?.primaryICP || 'Not profiled yet'}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-red-500">Core Audience Pain Points</h4>
                  <div className="space-y-2">
                    {(research.audienceProfile?.painPoints || []).map((pain: string, i: number) => (
                      <div key={i} className="p-3 bg-red-50/60 rounded-xl border border-red-100 text-xs font-medium text-red-900 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <span>{pain}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600">Key Desires & Transformation Goals</h4>
                  <div className="space-y-2">
                    {(research.audienceProfile?.desiresAndGoals || []).map((goal: string, i: number) => (
                      <div key={i} className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs font-medium text-emerald-900 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
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
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-500" />
                  Strategic Content Pillars & Blueprint
                </h3>
                <p className="text-xs text-gray-500">Core content pillars, campaign themes, and hashtag strategies formulated by Agent 4.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {(research.marketingStrategy?.contentPillars || []).map((pillar: any, i: number) => (
                  <div key={i} className="p-5 rounded-2xl border border-gray-200 bg-gray-50 space-y-2">
                    <div className="font-bold text-gray-900 text-sm">{pillar.title}</div>
                    <p className="text-xs text-gray-600 leading-relaxed">{pillar.description}</p>
                    <div className="pt-2 border-t border-gray-200">
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Example Topics:</div>
                      <ul className="text-xs text-gray-800 space-y-1 mt-1 font-medium">
                        {(pillar.exampleTopics || []).map((t: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <ChevronRight className="w-3 h-3 text-amber-500 shrink-0" /> {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Campaign Concepts</h4>
                  <div className="space-y-1.5">
                    {(research.marketingStrategy?.campaignConcepts || []).map((concept: string, i: number) => (
                      <div key={i} className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs font-semibold text-gray-900">
                        {concept}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Hashtag & CTA Strategy</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(research.marketingStrategy?.hashtagStrategy || []).map((tag: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-gray-100 text-gray-800 text-xs font-mono rounded-md border border-gray-200">
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
