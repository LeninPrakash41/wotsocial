import { generatePaidAdCampaign, PaidAdCampaignPackage } from "./adService";
import { runAgent } from "./agentRuntime";

export type AIProvider = 'gemini' | 'claude';
export type AIModel = 'gemini-3-flash' | 'gemini-3.1-pro' | 'claude-3-5-sonnet' | 'claude-3-opus';

export interface SiteAnalysisResult {
  valueProposition: string;
  keyOfferings: string[];
  brandVoice: string;
  brandPersonalityTraits: string[];
  visualIdentitySummary: string;
  suggestedColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  primaryHooks: string[];
}

export interface CompetitorAnalysisResult {
  topCompetitors: string[];
  competitorContentStrategies: string[];
  marketPositioning: string;
  contentGapsAndOpportunities: string[];
  recommendedDifferentiation: string;
}

export interface AudienceProfileResult {
  primaryICP: string;
  demographics: {
    ageRange: string;
    rolesOrProfessions: string[];
    industries: string[];
  };
  painPoints: string[];
  desiresAndGoals: string[];
  preferredPlatforms: string[];
  contentResonanceTriggers: string[];
}

export interface MarketingStrategyResult {
  contentPillars: {
    title: string;
    description: string;
    exampleTopics: string[];
  }[];
  postingFrequency: string;
  campaignConcepts: string[];
  hashtagStrategy: string[];
  callToActionFrameworks: string[];
}

export interface GeneratedPostPackage {
  topic: string;
  contentPillar: string;
  twitterPost: string;
  linkedinPost: string;
  instagramPost: string;
  facebookPost: string;
  hashtags: string[];
  visualPrompt: string;
  suggestedMediaType: 'image' | 'video' | 'none';
  callToAction: string;
}

export interface AgentPipelineResult {
  siteAnalysis: SiteAnalysisResult;
  competitorAnalysis: CompetitorAnalysisResult;
  audienceProfile: AudienceProfileResult;
  marketingStrategy: MarketingStrategyResult;
  postPackages: GeneratedPostPackage[];
  adCampaign?: PaidAdCampaignPackage;
}



// Helper dispatcher for LLM execution
/*
 * The five pipeline agents below are thin wrappers now. Their prompts, models
 * and output shapes live in the registry (Agent Studio → Manage agents), so a
 * customer's published edit is what actually runs here — these functions only
 * decide which context each stage is given.
 */

// 1. Site Analysis Agent
export const runSiteAnalysisAgent = async (params: {
  brandName: string;
  websiteUrl?: string;
  guidelinesText?: string;
  provider?: AIProvider;
  model?: AIModel;
  brandId?: string;
}): Promise<SiteAnalysisResult> => {
  const { result } = await runAgent<SiteAnalysisResult>('site_analysis', {
    brandName: params.brandName,
    websiteUrl: params.websiteUrl,
    guidelines: params.guidelinesText
  }, { provider: params.provider, brandId: params.brandId });
  return result;
};

// 2. Competitor & Market Analysis Agent
export const runCompetitorAnalysisAgent = async (params: {
  brandName: string;
  industry: string;
  category: string;
  valueProp: string;
  provider?: AIProvider;
  model?: AIModel;
  brandId?: string;
}): Promise<CompetitorAnalysisResult> => {
  const { result } = await runAgent<CompetitorAnalysisResult>('competitor_analysis', {
    brandName: params.brandName,
    industry: params.industry,
    category: params.category,
    valueProposition: params.valueProp
  }, { provider: params.provider, brandId: params.brandId });
  return result;
};

// 3. Audience Profiling Agent
export const runAudienceProfilingAgent = async (params: {
  brandName: string;
  industry: string;
  valueProp: string;
  keyOfferings: string[];
  provider?: AIProvider;
  model?: AIModel;
  brandId?: string;
}): Promise<AudienceProfileResult> => {
  const { result } = await runAgent<AudienceProfileResult>('audience_profiling', {
    brandName: params.brandName,
    industry: params.industry,
    valueProposition: params.valueProp,
    keyOfferings: params.keyOfferings
  }, { provider: params.provider, brandId: params.brandId });
  return result;
};

// 4. Marketing Strategy Agent
export const runMarketingStrategyAgent = async (params: {
  brandName: string;
  siteAnalysis: SiteAnalysisResult | null;
  competitorAnalysis: CompetitorAnalysisResult | null;
  audienceProfile: AudienceProfileResult | null;
  provider?: AIProvider;
  model?: AIModel;
  brandId?: string;
}): Promise<MarketingStrategyResult> => {
  const { result } = await runAgent<MarketingStrategyResult>('marketing_strategy', {
    brandName: params.brandName,
    brandVoice: params.siteAnalysis?.brandVoice,
    valueProposition: params.siteAnalysis?.valueProposition,
    differentiation: params.competitorAnalysis?.recommendedDifferentiation,
    primaryICP: params.audienceProfile?.primaryICP,
    painPoints: params.audienceProfile?.painPoints
  }, { provider: params.provider, brandId: params.brandId });
  return result;
};

// 5. Post Generation Agent
export const runPostGenerationAgent = async (params: {
  brandName: string;
  strategy: MarketingStrategyResult;
  audience: AudienceProfileResult;
  brandVoice: string;
  postCount?: number;
  provider?: AIProvider;
  model?: AIModel;
  brandId?: string;
}): Promise<GeneratedPostPackage[]> => {
  const { result } = await runAgent<GeneratedPostPackage[]>('post_generation', {
    brandName: params.brandName,
    brandVoice: params.brandVoice,
    postCount: params.postCount || 3,
    contentPillars: (params.strategy?.contentPillars || []).map(p => p.title),
    painPoints: params.audience?.painPoints,
    callToActions: params.strategy?.callToActionFrameworks
  }, { provider: params.provider, brandId: params.brandId });
  return Array.isArray(result) ? result : [result as any];
};

// Full End-to-End Orchestrator Pipeline
export const runEndToEndAgentPipeline = async (params: {
  brandName: string;
  websiteUrl?: string;
  guidelinesText?: string;
  industry?: string;
  category?: string;
  provider?: AIProvider;
  model?: AIModel;
  onProgress?: (step: string, status: 'running' | 'completed' | 'failed', data?: any) => void;
}): Promise<AgentPipelineResult> => {
  const { onProgress } = params;

  // Step 1: Site Analysis
  onProgress?.('Site Analysis Agent', 'running');
  const siteAnalysis = await runSiteAnalysisAgent(params);
  onProgress?.('Site Analysis Agent', 'completed', siteAnalysis);

  // Step 2: Competitor & Market Analysis
  onProgress?.('Competitor Analysis Agent', 'running');
  const competitorAnalysis = await runCompetitorAnalysisAgent({
    brandName: params.brandName,
    industry: params.industry || siteAnalysis.visualIdentitySummary || 'General',
    category: params.category || siteAnalysis.keyOfferings[0] || 'Business',
    valueProp: siteAnalysis.valueProposition,
    provider: params.provider,
    model: params.model
  });
  onProgress?.('Competitor Analysis Agent', 'completed', competitorAnalysis);

  // Step 3: Audience Profiling
  onProgress?.('Target Audience Agent', 'running');
  const audienceProfile = await runAudienceProfilingAgent({
    brandName: params.brandName,
    industry: params.industry || 'General',
    valueProp: siteAnalysis.valueProposition,
    keyOfferings: siteAnalysis.keyOfferings,
    provider: params.provider,
    model: params.model
  });
  onProgress?.('Target Audience Agent', 'completed', audienceProfile);

  // Step 4: Marketing Strategy
  onProgress?.('Marketing Strategy Agent', 'running');
  const marketingStrategy = await runMarketingStrategyAgent({
    brandName: params.brandName,
    siteAnalysis,
    competitorAnalysis,
    audienceProfile,
    provider: params.provider,
    model: params.model
  });
  onProgress?.('Marketing Strategy Agent', 'completed', marketingStrategy);

  // Step 5: Post Generation
  onProgress?.('Post Generation Agent', 'running');
  const postPackages = await runPostGenerationAgent({
    brandName: params.brandName,
    strategy: marketingStrategy,
    audience: audienceProfile,
    brandVoice: siteAnalysis.brandVoice,
    postCount: 3,
    provider: params.provider,
    model: params.model
  });
  onProgress?.('Post Generation Agent', 'completed', postPackages);

  // Step 6: Paid Ad Specialist Agent
  let adCampaign: PaidAdCampaignPackage | undefined = undefined;
  try {
    onProgress?.('Paid Ad Specialist Agent', 'running');
    adCampaign = await generatePaidAdCampaign({
      productOrOffer: siteAnalysis.keyOfferings[0] || siteAnalysis.valueProposition,
      brand: { name: params.brandName, industry: params.industry, brandTone: siteAnalysis.brandVoice },
      targetObjective: 'Conversions',
      destinationUrl: params.websiteUrl || 'https://example.com',
      provider: params.provider,
      model: params.model
    });
    onProgress?.('Paid Ad Specialist Agent', 'completed', adCampaign);
  } catch (adErr) {
    console.warn("Paid Ad Specialist Agent warning (non-fatal):", adErr);
    onProgress?.('Paid Ad Specialist Agent', 'completed', null);
  }

  return {
    siteAnalysis,
    competitorAnalysis,
    audienceProfile,
    marketingStrategy,
    postPackages,
    adCampaign
  };
};
