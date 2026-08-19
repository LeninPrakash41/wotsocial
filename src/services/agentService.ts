import { GoogleGenAI, Type } from "@google/genai";
import { generateClaudeJSON, getClaudeApiKey } from "./claudeService";
import { generatePaidAdCampaign, PaidAdCampaignPackage } from "./adService";
import { safeParseJSON } from "./jsonParser";
import { generateGeminiWithRetry } from "./geminiRetry";

export type AIProvider = 'gemini' | 'claude';
export type AIModel = 'gemini-3-flash' | 'gemini-3.1-pro' | 'claude-3-5-sonnet' | 'claude-3-opus';

const getGeminiApiKey = (): string => {
  return (localStorage.getItem('gemini_api_key') || '').trim();
};

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
async function runLLMTask<T>(params: {
  provider: AIProvider;
  model: AIModel;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema?: any;
  enableWebSearch?: boolean;
}): Promise<T> {
  const { provider, model, systemPrompt, userPrompt, jsonSchema, enableWebSearch } = params;

  if (provider === 'claude') {
    const claudeModelName = model === 'claude-3-opus' ? 'claude-3-opus-20240229' : 'claude-3-5-sonnet-20241022';
    let enrichedPrompt = userPrompt;
    if (enableWebSearch) {
      try {
        const searchResults = await executeGeminiSearch(userPrompt);
        if (searchResults) {
          enrichedPrompt = `[Live Web Search Context]:\n${searchResults}\n\n[User Task]:\n${userPrompt}`;
        }
      } catch (err) {
        console.warn("Search enrichment fallback failed, proceeding with direct Claude prompt:", err);
      }
    }
    return await generateClaudeJSON<T>({
      systemPrompt,
      userPrompt: enrichedPrompt,
      model: claudeModelName
    });
  }

  // Default to Gemini
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key missing. Please set your API key in the Integrations page.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const geminiModel = model === 'gemini-3.1-pro' ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the requested schema.`;
  const config: any = {
    responseMimeType: 'application/json'
  };

  if (jsonSchema) {
    config.responseSchema = jsonSchema;
  }

  if (enableWebSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  const response = await generateGeminiWithRetry({
    ai,
    model: geminiModel,
    contents: fullPrompt,
    config
  });

  const text = response.text || '{}';
  return safeParseJSON<T>(text);
}

// Internal search context helper using Gemini Search
async function executeGeminiSearch(query: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return '';
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await generateGeminiWithRetry({
      ai,
      model: 'gemini-3-flash-preview',
      contents: `Search web for latest insights on: ${query}. Return bullet summary.`,
      config: { tools: [{ googleSearch: {} }] }
    });
    return response.text || '';
  } catch (err) {
    console.warn("Web search query failed, skipping search context:", err);
    return '';
  }
}

// 1. Site Analysis Agent
export const runSiteAnalysisAgent = async (params: {
  brandName: string;
  websiteUrl?: string;
  guidelinesText?: string;
  provider?: AIProvider;
  model?: AIModel;
}): Promise<SiteAnalysisResult> => {
  const systemPrompt = `You are a Senior Brand Strategist & Site Analysis AI Agent. Analyze brand information, website content, and mission statement to extract the core brand DNA, value proposition, voice, personality, visual tone, and color palette.`;
  const userPrompt = `Analyze the brand below:
Brand Name: ${params.brandName}
${params.websiteUrl ? `Website URL: ${params.websiteUrl}` : ''}
${params.guidelinesText ? `Guidelines / Mission: ${params.guidelinesText}` : ''}

Extract and return a detailed JSON object:
{
  "valueProposition": "A concise statement of what makes this brand unique",
  "keyOfferings": ["Offering 1", "Offering 2", "Offering 3"],
  "brandVoice": "Description of voice (e.g., authoritative yet friendly)",
  "brandPersonalityTraits": ["Trait 1", "Trait 2", "Trait 3"],
  "visualIdentitySummary": "Description of visual aesthetic and mood",
  "suggestedColors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex"
  },
  "primaryHooks": ["Hook angle 1", "Hook angle 2", "Hook angle 3"]
}`;

  return await runLLMTask<SiteAnalysisResult>({
    provider: params.provider || 'gemini',
    model: params.model || 'gemini-3-flash',
    systemPrompt,
    userPrompt,
    enableWebSearch: Boolean(params.websiteUrl)
  });
};

// 2. Competitor & Market Analysis Agent
export const runCompetitorAnalysisAgent = async (params: {
  brandName: string;
  industry: string;
  category: string;
  valueProp: string;
  provider?: AIProvider;
  model?: AIModel;
}): Promise<CompetitorAnalysisResult> => {
  const systemPrompt = `You are a Competitive Intelligence & Market Research AI Agent. Conduct market analysis on top competitors in the specified industry, evaluate competitor content strategies, identify market gaps, and recommend strong brand differentiation.`;
  const userPrompt = `Conduct competitor analysis for:
Brand Name: ${params.brandName}
Industry: ${params.industry}
Category: ${params.category}
Value Proposition: ${params.valueProp}

Identify top competitors and return a JSON object:
{
  "topCompetitors": ["Competitor A", "Competitor B", "Competitor C"],
  "competitorContentStrategies": ["Strategy 1", "Strategy 2"],
  "marketPositioning": "Current market landscape and positioning overview",
  "contentGapsAndOpportunities": ["Opportunity 1", "Opportunity 2"],
  "recommendedDifferentiation": "How this brand can stand out on social media"
}`;

  return await runLLMTask<CompetitorAnalysisResult>({
    provider: params.provider || 'gemini',
    model: params.model || 'gemini-3-flash',
    systemPrompt,
    userPrompt,
    enableWebSearch: true
  });
};

// 3. Target Audience Agent
export const runAudienceProfilingAgent = async (params: {
  brandName: string;
  industry: string;
  valueProp: string;
  keyOfferings: string[];
  provider?: AIProvider;
  model?: AIModel;
}): Promise<AudienceProfileResult> => {
  const systemPrompt = `You are a Customer Psychology & Audience Profiling AI Agent. Build detailed Ideal Customer Profiles (ICPs), audience demographics, core pain points, emotional desires, and key content triggers for social media.`;
  const userPrompt = `Build audience profiles for:
Brand Name: ${params.brandName}
Industry: ${params.industry}
Value Proposition: ${params.valueProp}
Offerings: ${params.keyOfferings.join(', ')}

Return a JSON object:
{
  "primaryICP": "Detailed description of ideal customer profile",
  "demographics": {
    "ageRange": "e.g., 25-45",
    "rolesOrProfessions": ["Role 1", "Role 2"],
    "industries": ["Industry 1", "Industry 2"]
  },
  "painPoints": ["Pain point 1", "Pain point 2", "Pain point 3"],
  "desiresAndGoals": ["Goal 1", "Goal 2", "Goal 3"],
  "preferredPlatforms": ["twitter", "linkedin", "instagram", "facebook"],
  "contentResonanceTriggers": ["Trigger 1", "Trigger 2"]
}`;

  return await runLLMTask<AudienceProfileResult>({
    provider: params.provider || 'gemini',
    model: params.model || 'gemini-3-flash',
    systemPrompt,
    userPrompt
  });
};

// 4. Marketing Strategy & Content Pillars Agent
export const runMarketingStrategyAgent = async (params: {
  brandName: string;
  siteAnalysis: SiteAnalysisResult;
  competitorAnalysis: CompetitorAnalysisResult;
  audienceProfile: AudienceProfileResult;
  provider?: AIProvider;
  model?: AIModel;
}): Promise<MarketingStrategyResult> => {
  const systemPrompt = `You are a Chief Social Media Strategist AI Agent. Synthesize site analysis, competitor opportunities, and audience pain points into actionable content pillars, campaign concepts, hashtag strategy, and call-to-action frameworks.`;
  const userPrompt = `Develop a comprehensive marketing strategy using this research:
Brand: ${params.brandName}
Value Prop: ${params.siteAnalysis.valueProposition}
Competitor Gaps: ${params.competitorAnalysis.contentGapsAndOpportunities.join(', ')}
Audience Pain Points: ${params.audienceProfile.painPoints.join(', ')}
Audience Desires: ${params.audienceProfile.desiresAndGoals.join(', ')}

Return a JSON object:
{
  "contentPillars": [
    {
      "title": "Pillar 1 Name",
      "description": "Why this pillar works",
      "exampleTopics": ["Topic A", "Topic B"]
    },
    {
      "title": "Pillar 2 Name",
      "description": "Why this pillar works",
      "exampleTopics": ["Topic C", "Topic D"]
    },
    {
      "title": "Pillar 3 Name",
      "description": "Why this pillar works",
      "exampleTopics": ["Topic E", "Topic F"]
    }
  ],
  "postingFrequency": "e.g., 3x per week across LinkedIn and Twitter",
  "campaignConcepts": ["Campaign idea 1", "Campaign idea 2"],
  "hashtagStrategy": ["#Hashtag1", "#Hashtag2", "#Hashtag3"],
  "callToActionFrameworks": ["CTA 1", "CTA 2"]
}`;

  return await runLLMTask<MarketingStrategyResult>({
    provider: params.provider || 'gemini',
    model: params.model || 'gemini-3.1-pro',
    systemPrompt,
    userPrompt
  });
};

// 5. Post & Visual Asset Generation Agent
export const runPostGenerationAgent = async (params: {
  brandName: string;
  strategy: MarketingStrategyResult;
  audience: AudienceProfileResult;
  brandVoice: string;
  postCount?: number;
  provider?: AIProvider;
  model?: AIModel;
}): Promise<GeneratedPostPackage[]> => {
  const count = params.postCount || 3;
  const systemPrompt = `You are a Master Copywriter & Content Creator AI Agent. Using the established marketing strategy, content pillars, and audience insights, write ready-to-publish post packages for multiple platforms along with visual prompts for AI image/video generation.`;
  const userPrompt = `Generate ${count} distinct social media post packages for:
Brand Name: ${params.brandName}
Brand Voice: ${params.brandVoice}
Content Pillars: ${params.strategy.contentPillars.map(p => p.title).join(', ')}
Audience Pain Points: ${params.audience.painPoints.join(', ')}
CTAs: ${params.strategy.callToActionFrameworks.join(', ')}

Instructions:
1. For each package, write platform-customized versions for Twitter/X, LinkedIn, Instagram, and Facebook.
2. DO NOT use markdown bolding (asterisks **). Use clean line breaks.
3. Provide a detailed visual prompt for generating high-end image or video graphics matching the brand aesthetic.

Return a JSON array of objects:
[
  {
    "topic": "Post headline/topic",
    "contentPillar": "Selected Pillar Title",
    "twitterPost": "Twitter version (concise, engaging)",
    "linkedinPost": "LinkedIn version (professional, insightful, structured)",
    "instagramPost": "Instagram version (visually descriptive, engaging caption)",
    "facebookPost": "Facebook version (conversational, community-focused)",
    "hashtags": ["#Tag1", "#Tag2"],
    "visualPrompt": "Detailed prompt for Imagen/Veo AI media generator",
    "suggestedMediaType": "image",
    "callToAction": "Clear CTA text"
  }
]`;

  return await runLLMTask<GeneratedPostPackage[]>({
    provider: params.provider || 'gemini',
    model: params.model || 'gemini-3-flash',
    systemPrompt,
    userPrompt
  });
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
