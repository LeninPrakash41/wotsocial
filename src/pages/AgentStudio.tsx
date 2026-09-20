import { useState, useEffect } from 'react';
import { getBrands, updateBrand, addPost, Brand } from '../dbAdapter';
import { auth } from '../auth';
import { BrandSelector } from '../components/BrandSelector';
import { TabNav, LoadingPage } from '../components/ui';
import { AgentManager } from '../components/AgentManager';
import { Loader2, Bot, Sparkles, Target, Users, Search, ShieldCheck, ArrowRight, CheckCircle2, RefreshCw, Send, AlertTriangle, Layers, Calendar, ChevronDown, ChevronUp, Megaphone, Download, Play, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  runEndToEndAgentPipeline, 
  AgentPipelineResult, 
  AIProvider, 
  AIModel,
  runSiteAnalysisAgent,
  runCompetitorAnalysisAgent,
  runAudienceProfilingAgent,
  runMarketingStrategyAgent,
  runPostGenerationAgent
} from '../services/agentService';
import { generatePaidAdCampaign, downloadGoogleAdsEditorCSV } from '../services/adService';
import { crawlAndExtractBrandVoice } from '../services/brandVoiceCrawler';
import { cn } from '../lib/utils';

export function AgentStudio() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState<any[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [activeBrand, setActiveBrand] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Configuration
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [model, setModel] = useState<AIModel>('gemini-3-flash');

  // Input overrides
  const [customBrandName, setCustomBrandName] = useState('');
  const [customWebsiteUrl, setCustomWebsiteUrl] = useState('');
  const [customGuidelines, setCustomGuidelines] = useState('');

  // Execution state
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [stepLogs, setStepLogs] = useState<{ step: string; status: 'running' | 'completed' | 'failed'; timestamp: string }[]>([]);
  const [pipelineResult, setPipelineResult] = useState<AgentPipelineResult | null>(null);

  // UI accordion state
  const [expandedSection, setExpandedSection] = useState<'site' | 'competitor' | 'audience' | 'strategy' | 'posts' | 'ads' | null>('site');
  const [studioTab, setStudioTab] = useState<'run' | 'manage'>('run');
  const [savingToBrand, setSavingToBrand] = useState(false);
  const [brandSavedSuccess, setBrandSavedSuccess] = useState(false);
  const [schedulingPosts, setSchedulingPosts] = useState(false);

  useEffect(() => {
    const fetchUserBrands = async () => {
      try {
        const brandList = await getBrands();
        setBrands(brandList);

        const activeId = localStorage.getItem('activeBrandId') || brandList[0]?.id || '';
        if (activeId) {
          setSelectedBrandId(activeId);
          const found = brandList.find(b => b.id === activeId);
          if (found) {
            setActiveBrand(found);
            setCustomBrandName(found.name || '');
            setCustomWebsiteUrl(found.websiteUrl || '');
            setCustomGuidelines(found.guidelinesText || '');
            if (found.agentResearchData) {
              setPipelineResult(found.agentResearchData);
            }
          }
        }
      } catch (err) {
        console.error("Error loading brands for Agent Studio:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUserBrands();
  }, []);

  const handleSelectBrand = (b: Brand) => {
    setSelectedBrandId(b.id);
    localStorage.setItem('activeBrandId', b.id);
    setActiveBrand(b);
    setCustomBrandName(b.name || '');
    setCustomWebsiteUrl(b.websiteUrl || '');
    setCustomGuidelines(b.guidelinesText || '');
    if (b.agentResearchData) {
      setPipelineResult(b.agentResearchData);
    } else {
      setPipelineResult(null);
    }
  };

  // Individual agent statuses & voice crawler state
  const [agentStatuses, setAgentStatuses] = useState<Record<string, { status: 'idle' | 'running' | 'completed' | 'failed'; error?: string }>>({});
  const [crawlingVoice, setCrawlingVoice] = useState(false);

  const handleCrawlBrandVoice = async () => {
    const brandName = customBrandName || activeBrand?.name;
    if (!brandName) {
      alert("Please specify a Brand Name to crawl.");
      return;
    }
    setCrawlingVoice(true);
    try {
      const voiceProfile = await crawlAndExtractBrandVoice({
        brandName,
        websiteUrl: customWebsiteUrl,
        provider
      });
      setCustomGuidelines(voiceProfile.guidelinesText);
      alert(`AI Brand Voice Crawled Successfully!\n\nTone: ${voiceProfile.brandTone}\nTarget ICP: ${voiceProfile.targetICP}`);
      if (selectedBrandId) {
        await updateBrand(selectedBrandId, {
          brandTone: voiceProfile.brandTone,
          brandPersonality: voiceProfile.brandPersonality,
          guidelinesText: voiceProfile.guidelinesText
        });
      }
    } catch (err: any) {
      console.error("Error crawling brand voice:", err);
      alert(`Brand Voice Crawl Error: ${err?.message || String(err)}`);
    } finally {
      setCrawlingVoice(false);
    }
  };

  const handleRunSingleAgent = async (agentKey: 'site' | 'competitor' | 'audience' | 'strategy' | 'posts' | 'ads') => {
    const brandName = customBrandName || activeBrand?.name;
    if (!brandName) {
      alert("Please specify a Brand Name to run the agent.");
      return;
    }

    const geminiApiKey = (localStorage.getItem('gemini_api_key') || '').trim();
    const claudeApiKey = (localStorage.getItem('claude_api_key') || '').trim();

    if (provider === 'gemini' && !geminiApiKey) {
      alert("Missing Gemini API Key: Please configure your Gemini API Key in Integrations before running.");
      navigate('/integrations');
      return;
    }

    if (provider === 'claude' && !claudeApiKey) {
      alert("Missing Claude API Key: Please configure your Anthropic Claude API Key in Integrations before running.");
      navigate('/integrations');
      return;
    }

    setAgentStatuses(prev => ({ ...prev, [agentKey]: { status: 'running' } }));
    setExpandedSection(agentKey);

    try {
      let currentResult: any = pipelineResult || {
        siteAnalysis: null,
        competitorAnalysis: null,
        audienceProfile: null,
        marketingStrategy: null,
        postPackages: [],
        adCampaign: undefined
      };

      if (agentKey === 'site') {
        const site = await runSiteAnalysisAgent({ brandName, websiteUrl: customWebsiteUrl, guidelinesText: customGuidelines, provider, model });
        currentResult = { ...currentResult, siteAnalysis: site };
      } else if (agentKey === 'competitor') {
        const valueProp = currentResult.siteAnalysis?.valueProposition || 'High quality products & services';
        const comp = await runCompetitorAnalysisAgent({ brandName, industry: activeBrand?.industry || 'Business', category: activeBrand?.category || 'General', valueProp, provider, model });
        currentResult = { ...currentResult, competitorAnalysis: comp };
      } else if (agentKey === 'audience') {
        const valueProp = currentResult.siteAnalysis?.valueProposition || 'High quality products & services';
        const keyOfferings = currentResult.siteAnalysis?.keyOfferings || ['Core Offering 1'];
        const aud = await runAudienceProfilingAgent({ brandName, industry: activeBrand?.industry || 'Business', valueProp, keyOfferings, provider, model });
        currentResult = { ...currentResult, audienceProfile: aud };
      } else if (agentKey === 'strategy') {
        const strat = await runMarketingStrategyAgent({ brandName, siteAnalysis: currentResult.siteAnalysis, competitorAnalysis: currentResult.competitorAnalysis, audienceProfile: currentResult.audienceProfile, provider, model });
        currentResult = { ...currentResult, marketingStrategy: strat };
      } else if (agentKey === 'posts') {
        const posts = await runPostGenerationAgent({ brandName, strategy: currentResult.marketingStrategy, audience: currentResult.audienceProfile, brandVoice: currentResult.siteAnalysis?.brandVoice || 'Professional', postCount: 3, provider, model });
        currentResult = { ...currentResult, postPackages: posts };
      } else if (agentKey === 'ads') {
        const ad = await generatePaidAdCampaign({
          productOrOffer: currentResult.siteAnalysis?.keyOfferings?.[0] || currentResult.siteAnalysis?.valueProposition || 'Core Offerings & Products',
          brand: { name: brandName, industry: activeBrand?.industry, brandTone: currentResult.siteAnalysis?.brandVoice },
          targetObjective: 'Conversions',
          destinationUrl: customWebsiteUrl || 'https://example.com',
          provider,
          model
        });
        currentResult = { ...currentResult, adCampaign: ad };
      }

      setPipelineResult(currentResult as AgentPipelineResult);
      setAgentStatuses(prev => ({ ...prev, [agentKey]: { status: 'completed' } }));

      if (selectedBrandId) {
        await updateBrand(selectedBrandId, { agentResearchData: currentResult });
      }
    } catch (err: any) {
      console.error(`Error running single agent (${agentKey}):`, err);
      const errMsg = err?.message || String(err);
      setAgentStatuses(prev => ({ ...prev, [agentKey]: { status: 'failed', error: errMsg } }));
    }
  };

  const addLog = (step: string, status: 'running' | 'completed' | 'failed') => {
    setStepLogs(prev => [...prev.filter(l => l.step !== step || l.status !== 'running'), {
      step,
      status,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const handleRunPipeline = async () => {
    const brandName = customBrandName || activeBrand?.name;
    if (!brandName) {
      alert("Please specify a Brand Name to run the Agent Pipeline.");
      return;
    }

    const geminiApiKey = (localStorage.getItem('gemini_api_key') || '').trim();
    const claudeApiKey = (localStorage.getItem('claude_api_key') || '').trim();

    if (provider === 'gemini' && !geminiApiKey) {
      alert("Missing Gemini API Key: Please configure your Gemini API Key in Integrations before running the pipeline.");
      navigate('/integrations');
      return;
    }

    if (provider === 'claude' && !claudeApiKey) {
      alert("Missing Claude API Key: Please configure your Anthropic Claude API Key in Integrations before running the pipeline.");
      navigate('/integrations');
      return;
    }

    setRunning(true);
    setStepLogs([]);
    setPipelineResult(null);
    setCurrentStep('Initializing Multi-Agent Team...');

    try {
      const result = await runEndToEndAgentPipeline({
        brandName,
        websiteUrl: customWebsiteUrl,
        guidelinesText: customGuidelines,
        industry: activeBrand?.industry,
        category: activeBrand?.category,
        provider,
        model,
        onProgress: (step, status, data) => {
          setCurrentStep(step);
          addLog(step, status);
        }
      });

      setPipelineResult(result);
      setExpandedSection('posts');

      // Auto-persist research results to database
      if (selectedBrandId) {
        try {
          await updateBrand(selectedBrandId, {
            agentResearchData: result
          });
        } catch (saveErr) {
          console.warn("Auto-saving agent research data failed:", saveErr);
        }
      }
    } catch (err: any) {
      console.error("Agent Pipeline Error:", err);
      const msg = err?.message || String(err);
      alert(`Agent Pipeline Error: ${msg}`);
      if (msg.includes("API Key missing") || msg.includes("API key") || msg.includes("Integrations")) {
        navigate('/integrations');
      }
    } finally {
      setRunning(false);
      setCurrentStep('');
    }
  };

  const handleEnrichBrandProfile = async () => {
    if (!pipelineResult || !selectedBrandId) return;
    setSavingToBrand(true);
    setBrandSavedSuccess(false);

    try {
      const updatedData = {
        brandTone: pipelineResult.siteAnalysis.brandVoice,
        brandPersonality: pipelineResult.siteAnalysis.brandPersonalityTraits.join(', '),
        industry: activeBrand?.industry || pipelineResult.siteAnalysis.valueProposition.substring(0, 50),
        primaryColor: pipelineResult.siteAnalysis.suggestedColors.primary || activeBrand?.primaryColor || '#000000',
        secondaryColor: pipelineResult.siteAnalysis.suggestedColors.secondary || activeBrand?.secondaryColor || '#666666',
        accentColor: pipelineResult.siteAnalysis.suggestedColors.accent || activeBrand?.accentColor || '#3b82f6',
        brandColors: [
          pipelineResult.siteAnalysis.suggestedColors.primary,
          pipelineResult.siteAnalysis.suggestedColors.secondary,
          pipelineResult.siteAnalysis.suggestedColors.accent
        ].filter(Boolean),
        agentResearchData: {
          siteAnalysis: pipelineResult.siteAnalysis,
          competitorAnalysis: pipelineResult.competitorAnalysis,
          audienceProfile: pipelineResult.audienceProfile,
          marketingStrategy: pipelineResult.marketingStrategy,
          updatedAt: new Date().toISOString()
        }
      };

      await updateBrand(selectedBrandId, updatedData);
      setBrandSavedSuccess(true);
      setTimeout(() => setBrandSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Error enriching Brand Profile:", err);
      alert("Failed to enrich brand profile in Database.");
    } finally {
      setSavingToBrand(false);
    }
  };

  const handleSendPostsToScheduler = async () => {
    if (!pipelineResult || pipelineResult.postPackages.length === 0) return;
    setSchedulingPosts(true);

    try {
      const targetBrandId = selectedBrandId || activeBrand?.id || 'unassigned';
      const batch = pipelineResult.postPackages.map(async (pkg, idx) => {
        const schedTime = new Date();
        schedTime.setDate(schedTime.getDate() + (idx + 1));
        schedTime.setHours(10, 0, 0, 0);

        return await addPost({
          brandId: targetBrandId,
          content: `${pkg.linkedinPost || pkg.twitterPost}\n\n${pkg.hashtags.join(' ')}`,
          mediaUrl: '',
          mediaType: pkg.suggestedMediaType || 'image',
          scheduledTime: schedTime as any,
          status: 'suggested',
          platforms: ['linkedin', 'twitter'],
          visualPrompt: pkg.visualPrompt,
          isAgentGenerated: true
        });
      });

      await Promise.all(batch);
      alert(`Successfully sent ${pipelineResult.postPackages.length} agentic posts to the Scheduler!`);
      navigate('/schedule');
    } catch (err: any) {
      console.error("Error scheduling agent posts:", err);
      alert(`Failed to schedule agent posts: ${err?.message || String(err)}`);
    } finally {
      setSchedulingPosts(false);
    }
  };

  if (loading) return <LoadingPage label="Loading Agent Studio…" />;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-6 h-6 text-ink" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink bg-sunk border border-line px-2 py-0.5 rounded">Autonomous AI Workforce</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Agentic Workflow Studio</h1>
          <p className="text-ink-3 mt-1">Deploy specialized Gemini & Claude agents to automate site analysis, competitor tracking, audience profiling, and post generation.</p>
        </div>

        <div className="flex items-center gap-3 bg-surface p-2 rounded-xl border border-line shadow-xs">
          <BrandSelector activeBrandId={selectedBrandId} onBrandChange={handleSelectBrand} />

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-ink-4 uppercase tracking-wider block">Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                const p = e.target.value as AIProvider;
                setProvider(p);
                setModel(p === 'claude' ? 'claude-3-5-sonnet' : 'gemini-3-flash');
              }}
              className="text-xs font-medium bg-sunk border border-line rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="gemini">Google Gemini</option>
              <option value="claude">Anthropic Claude</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-ink-4 uppercase tracking-wider block">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as AIModel)}
              className="text-xs font-medium bg-sunk border border-line rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              {provider === 'gemini' ? (
                <>
                  <option value="gemini-3-flash">Gemini 3 Flash (Fast)</option>
                  <option value="gemini-3.1-pro">Gemini 3.1 Pro (Reasoning)</option>
                </>
              ) : (
                <>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Recommended)</option>
                  <option value="claude-3-opus">Claude 3 Opus (Deep Strategy)</option>
                </>
              )}
            </select>
          </div>
        </div>
      </header>

      <TabNav
        tabs={[
          { id: 'run', label: 'Run pipeline', icon: Play },
          { id: 'manage', label: 'Manage agents', icon: Settings2 }
        ]}
        active={studioTab}
        onChange={(id) => setStudioTab(id as any)}
      />

      {studioTab === 'manage' && <AgentManager brandId={selectedBrandId} />}

      {studioTab === 'run' && (<>

      {/* Target Setup Card */}
      <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Target className="w-5 h-5 text-accent" />
            Target Brand & Input Data
          </h2>

          {brands.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-3 font-medium">Select Saved Brand:</span>
              <select
                value={selectedBrandId}
                onChange={(e) => handleSelectBrand(e.target.value)}
                className="text-xs font-medium bg-sunk border border-line rounded-lg px-3 py-1.5 focus:outline-none"
              >
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-medium text-ink-2">Brand Name *</label>
            <input
              type="text"
              value={customBrandName}
              onChange={(e) => setCustomBrandName(e.target.value)}
              placeholder="e.g. Acme SaaS"
              className="w-full px-3.5 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-ink outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-ink-2">Website URL (For Live Scraping)</label>
            <input
              type="url"
              value={customWebsiteUrl}
              onChange={(e) => setCustomWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3.5 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-ink outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-ink-2">Guidelines / Product Text</label>
            <input
              type="text"
              value={customGuidelines}
              onChange={(e) => setCustomGuidelines(e.target.value)}
              placeholder="Short description or mission statement"
              className="w-full px-3.5 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-ink outline-none"
            />
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleCrawlBrandVoice}
            disabled={crawlingVoice || running}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-sunk text-ink border border-line font-semibold text-xs rounded-xl hover:bg-line transition-all disabled:opacity-50"
          >
            {crawlingVoice ? <Loader2 className="w-4 h-4 animate-spin text-ink" /> : <Search className="w-4 h-4 text-ink" />}
            {crawlingVoice ? 'Scraping & Extracting Voice...' : 'AI Crawl Website & Learn Brand Voice'}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunPipeline}
              disabled={running}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-white font-semibold text-sm rounded-xl hover:bg-ink-2 transition-all shadow-sm disabled:opacity-50"
            >
              {running ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
              {running ? 'Executing All 6 Agents...' : 'Run Full 6-Agent Pipeline (1-Click)'}
            </button>

            {running && (
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Loader2 className="w-4 h-4 animate-spin text-ink" />
                <span>{currentStep}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Agent Execution Progress Log */}
      {stepLogs.length > 0 && (
        <div className="bg-ink text-white border border-ink-2 rounded-2xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-ink-2 pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Bot className="w-4 h-4" />
              Agent Work Log & Thought Pipeline
            </div>
            {running && <span className="text-xs text-ink-4 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Processing agents...</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
            {[
              'Site Analysis Agent',
              'Competitor Analysis Agent',
              'Target Audience Agent',
              'Marketing Strategy Agent',
              'Post Generation Agent',
              'Paid Ad Specialist Agent'
            ].map((stepName, i) => {
              const log = stepLogs.find(l => l.step === stepName);
              const isRunning = log?.status === 'running';
              const isDone = log?.status === 'completed';

              return (
                <div 
                  key={stepName}
                  className={cn(
                    "p-3 rounded-xl border text-xs flex flex-col justify-between h-24 transition-all",
                    isDone ? "bg-ok/40 border-ok/60 text-ok-line" :
                    isRunning ? "bg-ink-2 border-ink-2 text-white animate-pulse" :
                    "bg-slate-900 border-slate-800 text-ink-4"
                  )}
                >
                  <div className="font-bold text-[11px] tracking-tight">{i + 1}. {stepName.replace(' Agent', '')}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]">
                      {isDone ? 'Completed' : isRunning ? 'Working...' : 'Pending'}
                    </span>
                    {isDone ? <CheckCircle2 className="w-4 h-4 text-ok" /> : isRunning ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <div className="w-2 h-2 rounded-full bg-ink-2" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent Results Accordion & Dashboard */}
      {pipelineResult && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-sunk border border-line p-6 rounded-2xl">
            <div>
              <h3 className="text-base font-semibold text-ink">Enrich Active Brand Profile</h3>
              <p className="text-sm text-ink-3">Save extracted voice, personality traits, value props, and colors directly into your brand configuration.</p>
            </div>
            <button
              onClick={handleEnrichBrandProfile}
              disabled={savingToBrand}
              className="px-5 py-2.5 bg-ink text-white font-medium rounded-xl hover:bg-ink-2 transition-colors shadow-xs text-sm shrink-0 flex items-center justify-center gap-2"
            >
              {savingToBrand ? <Loader2 className="w-4 h-4 animate-spin" /> : brandSavedSuccess ? <CheckCircle2 className="w-4 h-4 text-ok" /> : <ShieldCheck className="w-4 h-4" />}
              {savingToBrand ? 'Updating...' : brandSavedSuccess ? 'Brand Profile Updated!' : 'Save to Brand Profile'}
            </button>
          </div>

          {/* Section 1: Site Analysis */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <div className="w-full px-6 py-4 flex items-center justify-between bg-sunk/80 border-b border-line">
              <button
                onClick={() => setExpandedSection(expandedSection === 'site' ? null : 'site')}
                className="flex items-center gap-3 text-left flex-1"
              >
                <Search className="w-5 h-5 text-ink shrink-0" />
                <div>
                  <h3 className="font-semibold text-ink flex items-center gap-2">
                    1. Brand & Site Analysis Agent
                    {agentStatuses['site']?.status === 'completed' && <span className="text-[10px] font-bold bg-ok-soft text-ok px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completed</span>}
                    {agentStatuses['site']?.status === 'failed' && <span className="text-[10px] font-bold bg-danger-soft text-danger px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Failed</span>}
                  </h3>
                  <p className="text-xs text-ink-3">Value proposition, voice, personality, and visual tone</p>
                </div>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRunSingleAgent('site')}
                  disabled={agentStatuses['site']?.status === 'running'}
                  className="px-3 py-1.5 bg-ink text-white text-xs font-semibold rounded-lg hover:bg-ink-2 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {agentStatuses['site']?.status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                  {agentStatuses['site']?.status === 'running' ? 'Running Agent...' : 'Run Agent Now'}
                </button>
                <button onClick={() => setExpandedSection(expandedSection === 'site' ? null : 'site')}>
                  {expandedSection === 'site' ? <ChevronUp className="w-5 h-5 text-ink-4" /> : <ChevronDown className="w-5 h-5 text-ink-4" />}
                </button>
              </div>
            </div>

            {agentStatuses['site']?.status === 'failed' && (
              <div className="p-4 bg-danger-soft border-b border-danger-line text-danger text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                <span>Site Analysis Agent Error: {agentStatuses['site']?.error || "Execution failed. Please check your API key."}</span>
              </div>
            )}

            {expandedSection === 'site' && pipelineResult?.siteAnalysis && (
              <div className="p-6 border-t border-line space-y-6 text-sm">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-1">Core Value Proposition</h4>
                    <p className="font-medium text-ink bg-sunk p-3 rounded-xl border border-line">{pipelineResult?.siteAnalysis?.valueProposition || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-1">Brand Voice & Personality</h4>
                    <p className="font-medium text-ink bg-sunk p-3 rounded-xl border border-line">{pipelineResult?.siteAnalysis?.brandVoice || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-2">Key Product/Service Offerings</h4>
                  <div className="flex flex-wrap gap-2">
                    {(pipelineResult?.siteAnalysis?.keyOfferings || []).map((o, i) => (
                      <span key={i} className="px-3 py-1 bg-sunk text-ink-2 rounded-lg font-medium text-xs border border-line">{o}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-2">Primary Content Hooks</h4>
                  <ul className="space-y-1 text-ink-2">
                    {(pipelineResult?.siteAnalysis?.primaryHooks || []).map((h, i) => (
                      <li key={i} className="flex items-center gap-2"><ArrowRight className="w-3.5 h-3.5 text-ink-3 shrink-0" /> {h}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Competitor Analysis */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'competitor' ? null : 'competitor')}
              className="w-full px-6 py-4 flex items-center justify-between bg-sunk/80 hover:bg-sunk/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-ink" />
                <div>
                  <h3 className="font-semibold text-ink">2. Competitor & Market Analysis Agent Results</h3>
                  <p className="text-xs text-ink-3">Market positioning, competitor strategies, and content gaps</p>
                </div>
              </div>
              {expandedSection === 'competitor' ? <ChevronUp className="w-5 h-5 text-ink-4" /> : <ChevronDown className="w-5 h-5 text-ink-4" />}
            </button>

            {expandedSection === 'competitor' && pipelineResult?.competitorAnalysis && (
              <div className="p-6 border-t border-line space-y-6 text-sm">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-2">Identified Top Competitors</h4>
                  <div className="flex flex-wrap gap-2">
                    {(pipelineResult?.competitorAnalysis?.topCompetitors || []).map((c, i) => (
                      <span key={i} className="px-3 py-1 bg-sunk text-ink rounded-lg font-medium text-xs border border-line">{c}</span>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-1">Content Gaps & Opportunities</h4>
                    <ul className="space-y-1 text-ink-2 bg-sunk p-3.5 rounded-xl border border-line">
                      {(pipelineResult?.competitorAnalysis?.contentGapsAndOpportunities || []).map((g, i) => (
                        <li key={i} className="flex items-start gap-2"><Sparkles className="w-3.5 h-3.5 text-ink-3 shrink-0 mt-0.5" /> {g}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-1">Recommended Differentiation Angle</h4>
                    <p className="font-medium text-ink bg-sunk p-3.5 rounded-xl border border-line">{pipelineResult?.competitorAnalysis?.recommendedDifferentiation || 'N/A'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Target Audience */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'audience' ? null : 'audience')}
              className="w-full px-6 py-4 flex items-center justify-between bg-sunk/80 hover:bg-sunk/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-ink" />
                <div>
                  <h3 className="font-semibold text-ink">3. Target Audience Profiling Agent Results</h3>
                  <p className="text-xs text-ink-3">Ideal Customer Profile (ICP), pain points, and desires</p>
                </div>
              </div>
              {expandedSection === 'audience' ? <ChevronUp className="w-5 h-5 text-ink-4" /> : <ChevronDown className="w-5 h-5 text-ink-4" />}
            </button>

            {expandedSection === 'audience' && pipelineResult?.audienceProfile && (
              <div className="p-6 border-t border-line space-y-6 text-sm">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-1">Primary Ideal Customer Profile (ICP)</h4>
                  <p className="font-medium text-ink bg-sunk p-3.5 rounded-xl border border-line">{pipelineResult?.audienceProfile?.primaryICP || 'N/A'}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-2">Core Audience Pain Points</h4>
                    <ul className="space-y-1.5 text-ink-2">
                      {(pipelineResult?.audienceProfile?.painPoints || []).map((p, i) => (
                        <li key={i} className="flex items-start gap-2 bg-sunk text-ink p-2 rounded-lg text-xs font-medium"><AlertTriangle className="w-3.5 h-3.5 text-ink-3 shrink-0 mt-0.5" /> {p}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-2">Key Desires & Transformation Goals</h4>
                    <ul className="space-y-1.5 text-ink-2">
                      {(pipelineResult?.audienceProfile?.desiresAndGoals || []).map((d, i) => (
                        <li key={i} className="flex items-start gap-2 bg-sunk text-ink p-2 rounded-lg text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5 text-ink-3 shrink-0 mt-0.5" /> {d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Marketing Strategy */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'strategy' ? null : 'strategy')}
              className="w-full px-6 py-4 flex items-center justify-between bg-sunk/80 hover:bg-sunk/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-ink" />
                <h3 className="font-semibold text-ink">4. Marketing Strategy & Content Pillars Agent Results</h3>
              </div>
              {expandedSection === 'strategy' ? <ChevronUp className="w-5 h-5 text-ink-4" /> : <ChevronDown className="w-5 h-5 text-ink-4" />}
            </button>

            {expandedSection === 'strategy' && pipelineResult?.marketingStrategy && (
              <div className="p-6 border-t border-line space-y-6 text-sm">
                <h3 className="text-lg font-semibold text-ink">Recommended Strategic Content Pillars</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {(pipelineResult?.marketingStrategy?.contentPillars || []).map((pillar, i) => (
                    <div key={i} className="p-4 rounded-xl border border-line bg-sunk space-y-2">
                      <div className="font-semibold text-ink text-sm">{pillar.title}</div>
                      <p className="text-xs text-ink-3 leading-relaxed">{pillar.description}</p>
                      <div className="pt-2">
                        <div className="text-[10px] font-bold text-ink-4 uppercase">Topics:</div>
                        <ul className="text-xs text-ink-2 space-y-1 mt-1">
                          {(pillar.exampleTopics || []).map((t, idx) => (
                            <li key={idx}>• {t}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-6 pt-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-2">Campaign Concepts</h4>
                    <ul className="space-y-1 text-xs font-medium text-ink-2">
                      {(pipelineResult?.marketingStrategy?.campaignConcepts || []).map((c, i) => (
                        <li key={i} className="p-2 bg-sunk rounded-lg border border-line">{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-2">Hashtag & CTA Strategy</h4>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(pipelineResult?.marketingStrategy?.hashtagStrategy || []).map((h, i) => (
                        <span key={i} className="text-xs font-mono bg-sunk px-2 py-1 rounded">{h}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Post Generation Packages */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'posts' ? null : 'posts')}
              className="w-full px-6 py-4 flex items-center justify-between bg-ink text-white text-left"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-semibold text-base">Generated Multi-Platform Post Packages</h3>
                  <p className="text-xs text-ink-4">{pipelineResult?.postPackages?.length || 0} complete posts ready for publishing</p>
                </div>
              </div>
              {expandedSection === 'posts' ? <ChevronUp className="w-5 h-5 text-ink-4" /> : <ChevronDown className="w-5 h-5 text-ink-4" />}
            </button>

            {expandedSection === 'posts' && (
              <div className="p-6 border-t border-line space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
                  <span className="text-xs font-semibold text-ink-3 uppercase tracking-wider">Agent Post Generation Output</span>
                  <button
                    onClick={handleSendPostsToScheduler}
                    disabled={schedulingPosts}
                    className="px-4 py-2 bg-ink text-white text-xs font-medium rounded-xl hover:bg-ink-2 transition-colors flex items-center gap-2"
                  >
                    {schedulingPosts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4 text-white" />}
                    {schedulingPosts ? 'Scheduling...' : 'Send All Posts to Scheduler'}
                  </button>
                </div>

                <div className="space-y-6">
                  {(pipelineResult?.postPackages || []).map((pkg, idx) => (
                    <div key={idx} className="border border-line rounded-2xl p-6 bg-sunk/50 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-ink text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                          <h4 className="font-bold text-ink">{pkg.topic}</h4>
                        </div>
                        <span className="text-xs font-medium bg-line text-ink-2 px-2.5 py-0.5 rounded-full w-fit">Pillar: {pkg.contentPillar}</span>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        {/* LinkedIn Version */}
                        <div className="bg-surface p-4 rounded-xl border border-line space-y-2">
                          <div className="text-xs font-bold text-accent-ink flex items-center gap-1.5">
                            LinkedIn Version
                          </div>
                          <p className="text-xs text-ink-2 whitespace-pre-wrap leading-relaxed">{pkg.linkedinPost}</p>
                        </div>

                        {/* Twitter Version */}
                        <div className="bg-surface p-4 rounded-xl border border-line space-y-2">
                          <div className="text-xs font-bold text-accent flex items-center gap-1.5">
                            Twitter / X Version
                          </div>
                          <p className="text-xs text-ink-2 whitespace-pre-wrap leading-relaxed">{pkg.twitterPost}</p>
                        </div>
                      </div>

                      {/* Visual Media Prompt */}
                      {pkg.visualPrompt && (
                        <div className="p-4 bg-warn-soft/60 border border-warn-line rounded-xl space-y-1">
                          <div className="text-xs font-bold text-warn uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-warn" />
                            Suggested Visual Prompt (for Imagen 3 / Veo AI):
                          </div>
                          <p className="text-xs text-warn font-mono">{pkg.visualPrompt}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 6: Paid Ad Specialist Agent */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <div className="w-full px-6 py-4 flex items-center justify-between bg-ink text-white">
              <button
                onClick={() => setExpandedSection(expandedSection === 'ads' ? null : 'ads')}
                className="flex items-center gap-3 text-left flex-1"
              >
                <Megaphone className="w-5 h-5 text-warn shrink-0" />
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    6. Paid Ad Campaign Specialist Agent
                    {agentStatuses['ads']?.status === 'completed' && <span className="text-[10px] font-bold bg-ok/20 text-ok-line border border-ok/30 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-ok" /> Completed Successfully</span>}
                    {agentStatuses['ads']?.status === 'failed' && <span className="text-[10px] font-bold bg-danger/20 text-danger-line border border-danger/30 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-danger" /> Failed</span>}
                  </h3>
                  <p className="text-xs text-ink-4">AIDA/PAS Meta ad copy, 15 Google RSA headlines, and 1-click Google Ads CSV Export</p>
                </div>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRunSingleAgent('ads')}
                  disabled={agentStatuses['ads']?.status === 'running'}
                  className="px-3 py-1.5 bg-warn hover:bg-warn text-ink text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {agentStatuses['ads']?.status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-ink" /> : <Bot className="w-3.5 h-3.5 text-ink" />}
                  {agentStatuses['ads']?.status === 'running' ? 'Running Ad Agent...' : 'Run Ad Agent Now'}
                </button>
                <button onClick={() => setExpandedSection(expandedSection === 'ads' ? null : 'ads')}>
                  {expandedSection === 'ads' ? <ChevronUp className="w-5 h-5 text-ink-4" /> : <ChevronDown className="w-5 h-5 text-ink-4" />}
                </button>
              </div>
            </div>

            {agentStatuses['ads']?.status === 'failed' && (
              <div className="p-4 bg-danger-soft border-b border-danger-line text-danger text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                <span>Paid Ad Specialist Agent Error: {agentStatuses['ads']?.error || "Failed to generate ad copy. Please verify your Gemini API key."}</span>
              </div>
            )}

            {agentStatuses['ads']?.status === 'completed' && (
              <div className="p-3 bg-ok-soft border-b border-ok-line text-ok text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-ok shrink-0" />
                <span>Success: Paid Ad Campaign generated cleanly! Meta ad copy and 15 Google RSA headlines are ready for download.</span>
              </div>
            )}

            {expandedSection === 'ads' && pipelineResult?.adCampaign && (
                <div className="p-6 border-t border-line space-y-6">
                  {/* Meta Ad Card */}
                  <div className="border border-line rounded-xl p-5 space-y-3 bg-sunk/60">
                    <div className="flex items-center justify-between border-b border-line pb-2">
                      <span className="font-bold text-xs text-ink">Meta Sponsored Ad Package (FB & IG)</span>
                      <span className="text-[10px] font-bold bg-warn-soft text-warn px-2 py-0.5 rounded">{pipelineResult.adCampaign.metaAd.framework} Framework</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-bold text-ink-4 uppercase text-[10px]">Primary Text (Short):</span>
                        <p className="font-medium text-ink bg-surface p-2.5 rounded-lg border border-line">{pipelineResult.adCampaign.metaAd.primaryTextShort}</p>
                      </div>

                      <div>
                        <span className="font-bold text-ink-4 uppercase text-[10px]">Primary Text (Long / Storytelling):</span>
                        <p className="text-ink-2 bg-surface p-2.5 rounded-lg border border-line whitespace-pre-wrap">{pipelineResult.adCampaign.metaAd.primaryTextLong}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-1">
                        <div>
                          <span className="font-bold text-ink-4 uppercase text-[10px]">Ad Headline ($\le 45$ chars):</span>
                          <p className="font-bold text-ink text-sm">{pipelineResult.adCampaign.metaAd.headline}</p>
                        </div>
                        <div>
                          <span className="font-bold text-ink-4 uppercase text-[10px]">Recommended CTA Button:</span>
                          <p className="font-bold text-accent">{pipelineResult.adCampaign.metaAd.ctaButton}</p>
                        </div>
                      </div>

                      {/* Meta Targeting */}
                      <div className="pt-2 border-t border-line">
                        <span className="font-bold text-ink-4 uppercase text-[10px]">Meta Ads Manager Interest Categories:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {pipelineResult.adCampaign.metaAd.metaTargeting.interests.map((int, i) => (
                            <span key={i} className="bg-sunk text-ink text-[10px] font-semibold px-2.5 py-0.5 rounded border border-line">{int}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Google RSA Card */}
                  <div className="border border-line rounded-xl p-5 space-y-3 bg-surface">
                    <div className="flex items-center justify-between border-b border-line pb-2">
                      <span className="font-bold text-xs text-ok">Google Search Ads (Responsive Search Ads - RSA)</span>
                      <button
                        onClick={() => downloadGoogleAdsEditorCSV(pipelineResult.adCampaign!.googleAd)}
                        className="px-3.5 py-1.5 bg-accent hover:bg-accent text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Google Ads CSV
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="font-bold text-ink-4 uppercase text-[10px]">15 Responsive Search Headlines ($\le 30$ chars):</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mt-1">
                          {pipelineResult.adCampaign.googleAd.headlines.map((h, i) => (
                            <div key={i} className="bg-sunk p-2 rounded border border-line text-[11px] flex justify-between">
                              <span className="font-semibold text-ink line-clamp-1">{h}</span>
                              <span className="text-[9px] text-ink-4 shrink-0 ml-1">{h.length}/30</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-bold text-ink-4 uppercase text-[10px]">4 Descriptions ($\le 90$ chars):</span>
                        <div className="space-y-1 mt-1">
                          {pipelineResult.adCampaign.googleAd.descriptions.map((d, i) => (
                            <div key={i} className="bg-sunk p-2 rounded border border-line text-[11px] flex justify-between">
                              <span className="text-ink-2">{d}</span>
                              <span className="text-[9px] text-ink-4 shrink-0 ml-1">{d.length}/90</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </>)}
    </div>
  );
}
