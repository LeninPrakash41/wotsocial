import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, limit, getDoc } from 'firebase/firestore';
import { Loader2, Bot, Sparkles, Target, Users, Search, ShieldCheck, ArrowRight, CheckCircle2, RefreshCw, Send, AlertTriangle, Layers, Calendar, ChevronDown, ChevronUp, Megaphone, Download } from 'lucide-react';
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
import { downloadGoogleAdsEditorCSV } from '../services/adService';
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
  const [savingToBrand, setSavingToBrand] = useState(false);
  const [brandSavedSuccess, setBrandSavedSuccess] = useState(false);
  const [schedulingPosts, setSchedulingPosts] = useState(false);

  useEffect(() => {
    const fetchUserBrands = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'brands'),
          where('userId', '==', auth.currentUser.uid)
        );
        const snapshot = await getDocs(q);
        const brandList = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
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

  const handleSelectBrand = (brandId: string) => {
    setSelectedBrandId(brandId);
    localStorage.setItem('activeBrandId', brandId);
    const b = brands.find(item => item.id === brandId);
    if (b) {
      setActiveBrand(b);
      setCustomBrandName(b.name || '');
      setCustomWebsiteUrl(b.websiteUrl || '');
      setCustomGuidelines(b.guidelinesText || '');
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
    } catch (err: any) {
      console.error("Agent Pipeline Error:", err);
      alert(`Agent Pipeline Error: ${err.message || String(err)}`);
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
        },
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'brands', selectedBrandId), updatedData);
      setBrandSavedSuccess(true);
      setTimeout(() => setBrandSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Error enriching Brand Profile:", err);
      alert("Failed to enrich brand profile in Firestore.");
    } finally {
      setSavingToBrand(false);
    }
  };

  const handleSendPostsToScheduler = async () => {
    if (!pipelineResult || pipelineResult.postPackages.length === 0) return;
    setSchedulingPosts(true);

    try {
      const batch = pipelineResult.postPackages.map(async (pkg, idx) => {
        const schedTime = new Date();
        schedTime.setDate(schedTime.getDate() + (idx + 1));
        schedTime.setHours(10, 0, 0, 0);

        return await addDoc(collection(db, 'posts'), {
          userId: auth.currentUser?.uid,
          brandId: selectedBrandId || 'unassigned',
          content: `${pkg.linkedinPost || pkg.twitterPost}\n\n${pkg.hashtags.join(' ')}`,
          mediaUrl: '',
          mediaType: pkg.suggestedMediaType || 'image',
          scheduledTime: schedTime,
          status: 'suggested',
          platforms: ['linkedin', 'twitter'],
          visualPrompt: pkg.visualPrompt,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isAgentGenerated: true
        });
      });

      await Promise.all(batch);
      alert(`Successfully sent ${pipelineResult.postPackages.length} agentic posts to the Scheduler!`);
      navigate('/schedule');
    } catch (err) {
      console.error("Error scheduling agent posts:", err);
      alert("Failed to schedule agent posts.");
    } finally {
      setSchedulingPosts(false);
    }
  };

  if (loading) return <div className="p-8">Loading Agent Studio...</div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-6 h-6 text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded">Autonomous AI Workforce</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Agentic Workflow Studio</h1>
          <p className="text-gray-500 mt-1">Deploy specialized Gemini & Claude agents to automate site analysis, competitor tracking, audience profiling, and post generation.</p>
        </div>

        {/* Model & Provider Switcher */}
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-xs">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                const p = e.target.value as AIProvider;
                setProvider(p);
                setModel(p === 'claude' ? 'claude-3-5-sonnet' : 'gemini-3-flash');
              }}
              className="text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="gemini">Google Gemini</option>
              <option value="claude">Anthropic Claude</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as AIModel)}
              className="text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
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

      {/* Target Setup Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            Target Brand & Input Data
          </h2>

          {brands.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Select Saved Brand:</span>
              <select
                value={selectedBrandId}
                onChange={(e) => handleSelectBrand(e.target.value)}
                className="text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
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
            <label className="text-xs font-medium text-gray-700">Brand Name *</label>
            <input
              type="text"
              value={customBrandName}
              onChange={(e) => setCustomBrandName(e.target.value)}
              placeholder="e.g. Acme SaaS"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-black outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">Website URL (For Live Scraping)</label>
            <input
              type="url"
              value={customWebsiteUrl}
              onChange={(e) => setCustomWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-black outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">Guidelines / Product Text</label>
            <input
              type="text"
              value={customGuidelines}
              onChange={(e) => setCustomGuidelines(e.target.value)}
              placeholder="Short description or mission statement"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-black outline-none"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleRunPipeline}
            disabled={running || !customBrandName}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-black via-gray-900 to-purple-950 text-white font-medium rounded-xl hover:opacity-95 transition-all shadow-md disabled:opacity-50"
          >
            {running ? <Loader2 className="w-5 h-5 animate-spin text-purple-400" /> : <Sparkles className="w-5 h-5 text-purple-400" />}
            {running ? `Running ${currentStep}...` : 'Launch Multi-Agent Pipeline'}
          </button>
        </div>
      </div>

      {/* Live Agent Execution Progress Log */}
      {stepLogs.length > 0 && (
        <div className="bg-gray-900 text-gray-100 border border-gray-800 rounded-2xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-purple-400">
              <Bot className="w-4 h-4" />
              Agent Work Log & Thought Pipeline
            </div>
            {running && <span className="text-xs text-amber-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Processing agents...</span>}
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
                    isDone ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300" :
                    isRunning ? "bg-purple-950/40 border-purple-600/60 text-purple-200 animate-pulse" :
                    "bg-gray-800/50 border-gray-800 text-gray-500"
                  )}
                >
                  <div className="font-bold text-[11px] tracking-tight">{i + 1}. {stepName.replace(' Agent', '')}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]">
                      {isDone ? 'Completed' : isRunning ? 'Working...' : 'Pending'}
                    </span>
                    {isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : isRunning ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <div className="w-2 h-2 rounded-full bg-gray-700" />}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 p-6 rounded-2xl">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Multi-Agent Strategy Package Ready</h2>
              <p className="text-sm text-gray-600 mt-1">Review the synthesized research from all 5 agents below, enrich your brand profile, or push posts to your scheduler.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {selectedBrandId && (
                <button
                  onClick={handleEnrichBrandProfile}
                  disabled={savingToBrand}
                  className="px-4 py-2.5 bg-white border border-gray-300 hover:border-black text-gray-800 text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-2"
                >
                  {savingToBrand ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                  {brandSavedSuccess ? 'Profile Enriched!' : 'Enrich Saved Brand Profile'}
                </button>
              )}
              <button
                onClick={handleSendPostsToScheduler}
                disabled={schedulingPosts}
                className="px-4 py-2.5 bg-black hover:bg-gray-800 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-2"
              >
                {schedulingPosts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4 text-purple-300" />}
                Push Posts to Scheduler
              </button>
            </div>
          </div>

          {/* Section 1: Site Analysis */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'site' ? null : 'site')}
              className="w-full px-6 py-4 flex items-center justify-between bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Search className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">1. Brand & Site Analysis Agent Results</h3>
                  <p className="text-xs text-gray-500">Value proposition, voice, personality, and visual tone</p>
                </div>
              </div>
              {expandedSection === 'site' ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {expandedSection === 'site' && (
              <div className="p-6 border-t border-gray-100 space-y-6 text-sm">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Core Value Proposition</h4>
                    <p className="font-medium text-gray-900 bg-gray-50 p-3 rounded-xl border border-gray-100">{pipelineResult.siteAnalysis.valueProposition}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Brand Voice & Personality</h4>
                    <p className="font-medium text-gray-900 bg-gray-50 p-3 rounded-xl border border-gray-100">{pipelineResult.siteAnalysis.brandVoice}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Key Product/Service Offerings</h4>
                  <div className="flex flex-wrap gap-2">
                    {pipelineResult.siteAnalysis.keyOfferings.map((o, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-50 text-blue-800 rounded-lg font-medium text-xs border border-blue-100">{o}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Primary Content Hooks</h4>
                  <ul className="space-y-1 text-gray-700">
                    {pipelineResult.siteAnalysis.primaryHooks.map((h, i) => (
                      <li key={i} className="flex items-center gap-2"><ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" /> {h}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Competitor Analysis */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'competitor' ? null : 'competitor')}
              className="w-full px-6 py-4 flex items-center justify-between bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">2. Competitor & Market Analysis Agent Results</h3>
                  <p className="text-xs text-gray-500">Market positioning, competitor strategies, and content gaps</p>
                </div>
              </div>
              {expandedSection === 'competitor' ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {expandedSection === 'competitor' && (
              <div className="p-6 border-t border-gray-100 space-y-6 text-sm">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Identified Top Competitors</h4>
                  <div className="flex flex-wrap gap-2">
                    {pipelineResult.competitorAnalysis.topCompetitors.map((c, i) => (
                      <span key={i} className="px-3 py-1 bg-amber-50 text-amber-900 rounded-lg font-medium text-xs border border-amber-200">{c}</span>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Content Gaps & Opportunities</h4>
                    <ul className="space-y-1 text-gray-700 bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                      {pipelineResult.competitorAnalysis.contentGapsAndOpportunities.map((g, i) => (
                        <li key={i} className="flex items-start gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> {g}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Recommended Differentiation Angle</h4>
                    <p className="font-medium text-gray-900 bg-gray-50 p-3.5 rounded-xl border border-gray-100">{pipelineResult.competitorAnalysis.recommendedDifferentiation}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Target Audience */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'audience' ? null : 'audience')}
              className="w-full px-6 py-4 flex items-center justify-between bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">3. Target Audience Profiling Agent Results</h3>
                  <p className="text-xs text-gray-500">Ideal Customer Profile (ICP), pain points, and desires</p>
                </div>
              </div>
              {expandedSection === 'audience' ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {expandedSection === 'audience' && (
              <div className="p-6 border-t border-gray-100 space-y-6 text-sm">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Primary Ideal Customer Profile (ICP)</h4>
                  <p className="font-medium text-gray-900 bg-gray-50 p-3.5 rounded-xl border border-gray-100">{pipelineResult.audienceProfile.primaryICP}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Core Audience Pain Points</h4>
                    <ul className="space-y-1.5 text-gray-700">
                      {pipelineResult.audienceProfile.painPoints.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 bg-red-50/60 text-red-900 p-2 rounded-lg text-xs font-medium"><AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" /> {p}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Key Desires & Transformation Goals</h4>
                    <ul className="space-y-1.5 text-gray-700">
                      {pipelineResult.audienceProfile.desiresAndGoals.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 bg-emerald-50/60 text-emerald-900 p-2 rounded-lg text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> {d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Marketing Strategy */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'strategy' ? null : 'strategy')}
              className="w-full px-6 py-4 flex items-center justify-between bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">4. Marketing Strategy & Content Pillars Agent Results</h3>
                  <p className="text-xs text-gray-500">Content pillars, posting cadence, and campaign concepts</p>
                </div>
              </div>
              {expandedSection === 'strategy' ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {expandedSection === 'strategy' && (
              <div className="p-6 border-t border-gray-100 space-y-6 text-sm">
                <div className="grid md:grid-cols-3 gap-4">
                  {pipelineResult.marketingStrategy.contentPillars.map((pillar, i) => (
                    <div key={i} className="p-4 rounded-xl border border-purple-100 bg-purple-50/40 space-y-2">
                      <div className="font-semibold text-purple-950 text-sm">{pillar.title}</div>
                      <p className="text-xs text-gray-600 leading-relaxed">{pillar.description}</p>
                      <div className="pt-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Topics:</div>
                        <ul className="text-xs text-gray-700 space-y-1 mt-1">
                          {pillar.exampleTopics.map((t, idx) => (
                            <li key={idx}>• {t}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-6 pt-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Campaign Concepts</h4>
                    <ul className="space-y-1 text-xs font-medium text-gray-800">
                      {pipelineResult.marketingStrategy.campaignConcepts.map((c, i) => (
                        <li key={i} className="p-2 bg-gray-50 rounded-lg border border-gray-100">{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Hashtag & CTA Strategy</h4>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {pipelineResult.marketingStrategy.hashtagStrategy.map((h, i) => (
                        <span key={i} className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{h}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Post Generation Packages */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedSection(expandedSection === 'posts' ? null : 'posts')}
              className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-purple-900 to-black text-white text-left"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-300" />
                <div>
                  <h3 className="font-semibold text-white">5. Generated Multi-Platform Post Packages</h3>
                  <p className="text-xs text-purple-200">{pipelineResult.postPackages.length} complete posts ready for publishing</p>
                </div>
              </div>
              {expandedSection === 'posts' ? <ChevronUp className="w-5 h-5 text-purple-200" /> : <ChevronDown className="w-5 h-5 text-purple-200" />}
            </button>

            {expandedSection === 'posts' && (
              <div className="p-6 border-t border-gray-100 space-y-8">
                {pipelineResult.postPackages.map((pkg, i) => (
                  <div key={i} className="border border-gray-200 rounded-2xl p-6 space-y-4 bg-gray-50/50 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <h4 className="font-bold text-gray-900">{pkg.topic}</h4>
                      </div>
                      <span className="text-xs font-medium bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full w-fit">Pillar: {pkg.contentPillar}</span>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {/* LinkedIn Version */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2">
                        <div className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                          LinkedIn Version
                        </div>
                        <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{pkg.linkedinPost}</p>
                      </div>

                      {/* Twitter Version */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2">
                        <div className="text-xs font-bold text-sky-600 flex items-center gap-1.5">
                          Twitter / X Version
                        </div>
                        <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{pkg.twitterPost}</p>
                      </div>
                    </div>

                    {/* Visual Media Prompt */}
                    {pkg.visualPrompt && (
                      <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1">
                        <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          Suggested Visual Prompt (for Imagen 3 / Veo AI):
                        </div>
                        <p className="text-xs text-amber-950 font-mono">{pkg.visualPrompt}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: Paid Ad Specialist Agent Results */}
          {pipelineResult.adCampaign && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedSection(expandedSection === 'ads' ? null : 'ads')}
                className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-amber-600 to-black text-white text-left"
              >
                <div className="flex items-center gap-3">
                  <Megaphone className="w-5 h-5 text-amber-300" />
                  <div>
                    <h3 className="font-semibold text-white">6. Paid Ad Campaign Agent Results (Meta & Google Ads)</h3>
                    <p className="text-xs text-amber-200">AIDA/PAS Meta copy, 15 Google RSA headlines, and 1-click Google Ads CSV Export</p>
                  </div>
                </div>
                {expandedSection === 'ads' ? <ChevronUp className="w-5 h-5 text-amber-200" /> : <ChevronDown className="w-5 h-5 text-amber-200" />}
              </button>

              {expandedSection === 'ads' && (
                <div className="p-6 border-t border-gray-100 space-y-6">
                  {/* Meta Ad Card */}
                  <div className="border border-gray-200 rounded-xl p-5 space-y-3 bg-gray-50/60">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                      <span className="font-bold text-xs text-gray-900">Meta Sponsored Ad Package (FB & IG)</span>
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">{pipelineResult.adCampaign.metaAd.framework} Framework</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-bold text-gray-400 uppercase text-[10px]">Primary Text (Short):</span>
                        <p className="font-medium text-gray-900 bg-white p-2.5 rounded-lg border border-gray-200">{pipelineResult.adCampaign.metaAd.primaryTextShort}</p>
                      </div>

                      <div>
                        <span className="font-bold text-gray-400 uppercase text-[10px]">Primary Text (Long / Storytelling):</span>
                        <p className="text-gray-800 bg-white p-2.5 rounded-lg border border-gray-200 whitespace-pre-wrap">{pipelineResult.adCampaign.metaAd.primaryTextLong}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-1">
                        <div>
                          <span className="font-bold text-gray-400 uppercase text-[10px]">Ad Headline ($\le 45$ chars):</span>
                          <p className="font-bold text-gray-900 text-sm">{pipelineResult.adCampaign.metaAd.headline}</p>
                        </div>
                        <div>
                          <span className="font-bold text-gray-400 uppercase text-[10px]">Recommended CTA Button:</span>
                          <p className="font-bold text-blue-600">{pipelineResult.adCampaign.metaAd.ctaButton}</p>
                        </div>
                      </div>

                      {/* Meta Targeting */}
                      <div className="pt-2 border-t border-gray-200">
                        <span className="font-bold text-gray-400 uppercase text-[10px]">Meta Ads Manager Interest Categories:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {pipelineResult.adCampaign.metaAd.metaTargeting.interests.map((int, i) => (
                            <span key={i} className="bg-purple-50 text-purple-900 text-[10px] font-semibold px-2.5 py-0.5 rounded border border-purple-200">{int}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Google RSA Card */}
                  <div className="border border-gray-200 rounded-xl p-5 space-y-3 bg-white">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                      <span className="font-bold text-xs text-emerald-800">Google Search Ads (Responsive Search Ads - RSA)</span>
                      <button
                        onClick={() => downloadGoogleAdsEditorCSV(pipelineResult.adCampaign!.googleAd)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Google Ads CSV
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="font-bold text-gray-400 uppercase text-[10px]">15 Responsive Search Headlines ($\le 30$ chars):</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mt-1">
                          {pipelineResult.adCampaign.googleAd.headlines.map((h, i) => (
                            <div key={i} className="bg-gray-50 p-2 rounded border border-gray-100 text-[11px] flex justify-between">
                              <span className="font-semibold text-gray-900 line-clamp-1">{h}</span>
                              <span className="text-[9px] text-gray-400 shrink-0 ml-1">{h.length}/30</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-bold text-gray-400 uppercase text-[10px]">4 Descriptions ($\le 90$ chars):</span>
                        <div className="space-y-1 mt-1">
                          {pipelineResult.adCampaign.googleAd.descriptions.map((d, i) => (
                            <div key={i} className="bg-gray-50 p-2 rounded border border-gray-100 text-[11px] flex justify-between">
                              <span className="text-gray-800">{d}</span>
                              <span className="text-[9px] text-gray-400 shrink-0 ml-1">{d.length}/90</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
