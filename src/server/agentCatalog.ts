/**
 * Built-in agent definitions.
 *
 * These seed the registry on first run. Once seeded they are ordinary rows:
 * a customer can edit any prompt, model, schema or capability and republish,
 * and the pipeline picks up the published version on the next run. Editing a
 * built-in does not fork it — it versions it, and the original stays
 * recoverable from the version history.
 *
 * Prompts are templates; `{{variable}}` placeholders are filled from the
 * declared `inputs` at run time.
 */

export type AgentCapability =
  | 'web_search'
  | 'brand_context'
  | 'strategy_context'
  | 'image_prompting'
  | 'bulk_generation'
  | 'publish_posts'
  | 'publish_blog'
  | 'product_catalog';

export const CAPABILITY_LABELS: Record<AgentCapability, { label: string; description: string }> = {
  web_search: {
    label: 'Live web search',
    description: 'Grounds answers in current search results. Slower, and only available on Gemini.'
  },
  brand_context: {
    label: 'Brand profile',
    description: 'Receives the brand name, industry, voice and guidelines.'
  },
  strategy_context: {
    label: 'Prior agent output',
    description: 'Receives the results of earlier agents in the pipeline.'
  },
  image_prompting: {
    label: 'Visual direction',
    description: 'Writes prompts for the image and video generators.'
  },
  bulk_generation: {
    label: 'Batch output',
    description: 'Can produce many items in one run, for poster and content batches.'
  },
  publish_posts: {
    label: 'Write to calendar',
    description: 'Output can be saved directly into the content schedule.'
  },
  publish_blog: {
    label: 'Publish to WordPress',
    description: 'Output can be sent to a connected WordPress site as a post.'
  },
  product_catalog: {
    label: 'Read product catalogue',
    description: 'Receives products from a connected Shopify store.'
  }
};

export interface AgentInput {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  default?: string | number;
  options?: string[];
  help?: string;
}

export interface AgentDefinition {
  key: string;
  name: string;
  role: string;
  description: string;
  /** Lucide icon name, resolved in the UI. */
  icon: string;
  provider: 'gemini' | 'claude';
  model: string;
  temperature: number;
  systemPrompt: string;
  userPromptTemplate: string;
  /** Example of the JSON the agent must return; also shown in the editor. */
  outputSchema: string;
  capabilities: AgentCapability[];
  inputs: AgentInput[];
  /** Where the agent sits in the end-to-end pipeline; null means standalone. */
  pipelineStage: number | null;
  sortOrder: number;
}

const BRAND_BLOCK = `Brand Name: {{brandName}}
Industry: {{industry}}
Category: {{category}}
Brand Voice: {{brandVoice}}
Guidelines: {{guidelines}}`;

export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    key: 'site_analysis',
    name: 'Brand DNA Analyst',
    role: 'Extracts the brand’s positioning, voice and visual identity',
    description:
      'Reads the website and any guidelines you provide, and returns the value proposition, key offerings, voice, personality and a suggested palette. Everything downstream builds on this.',
    icon: 'Layers',
    provider: 'gemini',
    model: 'gemini-3-flash',
    temperature: 0.6,
    systemPrompt:
      'You are a Senior Brand Strategist & Site Analysis AI Agent. Analyze brand information, website content, and mission statement to extract the core brand DNA, value proposition, voice, personality, visual tone, and color palette.',
    userPromptTemplate: `Analyze the brand below:
Brand Name: {{brandName}}
Website URL: {{websiteUrl}}
Guidelines / Mission: {{guidelines}}

Extract the brand's positioning and identity.`,
    outputSchema: `{
  "valueProposition": "A concise statement of what makes this brand unique",
  "keyOfferings": ["Offering 1", "Offering 2", "Offering 3"],
  "brandVoice": "Description of voice (e.g., authoritative yet friendly)",
  "brandPersonalityTraits": ["Trait 1", "Trait 2", "Trait 3"],
  "visualIdentitySummary": "Description of visual aesthetic and mood",
  "suggestedColors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex" },
  "primaryHooks": ["Hook angle 1", "Hook angle 2", "Hook angle 3"]
}`,
    capabilities: ['web_search', 'brand_context'],
    inputs: [
      { key: 'brandName', label: 'Brand name', type: 'text', required: true },
      { key: 'websiteUrl', label: 'Website URL', type: 'text' },
      { key: 'guidelines', label: 'Guidelines or mission', type: 'textarea' }
    ],
    pipelineStage: 1,
    sortOrder: 10
  },

  {
    key: 'competitor_analysis',
    name: 'Competitive Intelligence',
    role: 'Maps the competitive field and finds the gap',
    description:
      'Researches the main competitors in your category, reads how they position and what they publish, and recommends where your brand can credibly stand apart.',
    icon: 'Target',
    provider: 'gemini',
    model: 'gemini-3-flash',
    temperature: 0.6,
    systemPrompt:
      'You are a Competitive Intelligence & Market Research AI Agent. Conduct market analysis on top competitors in the specified industry, evaluate competitor content strategies, identify market gaps, and recommend strong brand differentiation.',
    userPromptTemplate: `Research the competitive landscape for:
${BRAND_BLOCK}
Value Proposition: {{valueProposition}}

Identify the leading competitors, how they position themselves, and where the gap is.`,
    outputSchema: `{
  "topCompetitors": [
    { "name": "Competitor", "positioning": "How they position", "contentStrategy": "What they publish", "weakness": "Where they are vulnerable" }
  ],
  "marketGaps": ["Gap 1", "Gap 2"],
  "recommendedDifferentiation": "The single clearest way this brand should stand apart",
  "contentOpportunities": ["Opportunity 1", "Opportunity 2"]
}`,
    capabilities: ['web_search', 'brand_context', 'strategy_context'],
    inputs: [
      { key: 'brandName', label: 'Brand name', type: 'text', required: true },
      { key: 'industry', label: 'Industry', type: 'text' },
      { key: 'valueProposition', label: 'Value proposition', type: 'textarea' }
    ],
    pipelineStage: 2,
    sortOrder: 20
  },

  {
    key: 'audience_profiling',
    name: 'Audience Psychologist',
    role: 'Builds the ideal customer profile and its pain points',
    description:
      'Turns the brand and market picture into concrete audience segments — who they are, what actually frustrates them, and what makes them act.',
    icon: 'Users',
    provider: 'gemini',
    model: 'gemini-3-flash',
    temperature: 0.7,
    systemPrompt:
      'You are a Customer Psychology & Audience Profiling AI Agent. Build detailed Ideal Customer Profiles (ICPs), audience demographics, core pain points, emotional desires, and key content triggers for social media.',
    userPromptTemplate: `Profile the audience for:
${BRAND_BLOCK}
Value Proposition: {{valueProposition}}
Key Offerings: {{keyOfferings}}

Build the ideal customer profile, their pain points and what triggers them to act.`,
    outputSchema: `{
  "primaryICP": "Who the ideal customer is, in one specific sentence",
  "demographics": "Age, role, company size, geography",
  "painPoints": ["Pain 1", "Pain 2", "Pain 3"],
  "emotionalDesires": ["Desire 1", "Desire 2"],
  "contentTriggers": ["What makes them stop scrolling"],
  "objections": ["Objection 1", "Objection 2"],
  "preferredPlatforms": ["linkedin", "instagram"]
}`,
    capabilities: ['brand_context', 'strategy_context'],
    inputs: [
      { key: 'brandName', label: 'Brand name', type: 'text', required: true },
      { key: 'industry', label: 'Industry', type: 'text' },
      { key: 'valueProposition', label: 'Value proposition', type: 'textarea' }
    ],
    pipelineStage: 3,
    sortOrder: 30
  },

  {
    key: 'marketing_strategy',
    name: 'Chief Strategist',
    role: 'Turns research into content pillars and campaigns',
    description:
      'Synthesises everything above into the plan the content agents work from: pillars, campaign concepts, hashtag strategy and CTA frameworks.',
    icon: 'Compass',
    provider: 'gemini',
    model: 'gemini-3-pro',
    temperature: 0.7,
    systemPrompt:
      'You are a Chief Social Media Strategist AI Agent. Synthesize site analysis, competitor opportunities, and audience pain points into actionable content pillars, campaign concepts, hashtag strategy, and call-to-action frameworks.',
    userPromptTemplate: `Build the content strategy for:
${BRAND_BLOCK}

Research so far:
Positioning: {{valueProposition}}
Differentiation: {{differentiation}}
Audience: {{primaryICP}}
Pain points: {{painPoints}}

Produce the content pillars and campaign concepts the team will execute against.`,
    outputSchema: `{
  "contentPillars": [
    { "title": "Pillar name", "description": "What it covers", "postTypes": ["Type 1", "Type 2"] }
  ],
  "campaignConcepts": [
    { "name": "Campaign", "objective": "What it is for", "hook": "The angle" }
  ],
  "hashtagStrategy": { "broad": ["#tag"], "niche": ["#tag"], "branded": ["#tag"] },
  "callToActionFrameworks": ["CTA 1", "CTA 2"],
  "postingCadence": "Recommended weekly rhythm"
}`,
    capabilities: ['brand_context', 'strategy_context'],
    inputs: [
      { key: 'brandName', label: 'Brand name', type: 'text', required: true }
    ],
    pipelineStage: 4,
    sortOrder: 40
  },

  {
    key: 'post_generation',
    name: 'Social Copywriter',
    role: 'Writes ready-to-publish posts for every platform',
    description:
      'Writes each post in the native voice of every platform at once, with hashtags, a call to action and a visual prompt the image generator can use directly.',
    icon: 'PenTool',
    provider: 'gemini',
    model: 'gemini-3-flash',
    temperature: 0.8,
    systemPrompt:
      'You are a Master Copywriter & Content Creator AI Agent. Using the established marketing strategy, content pillars, and audience insights, write ready-to-publish post packages for multiple platforms along with visual prompts for AI image/video generation.',
    userPromptTemplate: `Generate {{postCount}} distinct social media post packages for:
Brand Name: {{brandName}}
Brand Voice: {{brandVoice}}
Content Pillars: {{contentPillars}}
Audience Pain Points: {{painPoints}}
CTAs: {{callToActions}}

Instructions:
1. For each package, write platform-customized versions for Twitter/X, LinkedIn, Instagram, and Facebook.
2. DO NOT use markdown bolding (asterisks). Use clean line breaks.
3. Provide a detailed visual prompt for generating high-end image or video graphics matching the brand aesthetic.`,
    outputSchema: `[
  {
    "topic": "Post headline/topic",
    "contentPillar": "Selected Pillar Title",
    "twitterPost": "Twitter version (concise, engaging)",
    "linkedinPost": "LinkedIn version (professional, insightful, structured)",
    "instagramPost": "Instagram version (visually descriptive, engaging caption)",
    "facebookPost": "Facebook version (conversational, community-focused)",
    "hashtags": ["#Tag1", "#Tag2"],
    "visualPrompt": "Detailed prompt for the AI media generator",
    "suggestedMediaType": "image",
    "callToAction": "Clear CTA text"
  }
]`,
    capabilities: ['brand_context', 'strategy_context', 'image_prompting', 'bulk_generation', 'publish_posts'],
    inputs: [
      { key: 'brandName', label: 'Brand name', type: 'text', required: true },
      { key: 'postCount', label: 'How many posts', type: 'number', default: 3 },
      { key: 'brandVoice', label: 'Brand voice', type: 'text' }
    ],
    pipelineStage: 5,
    sortOrder: 50
  },

  {
    key: 'paid_ads',
    name: 'Direct-Response Ad Writer',
    role: 'Writes Meta and Google ad packages that respect character limits',
    description:
      'Produces a complete paid package: Meta primary text, headline and CTA with targeting suggestions, plus 15 Google headlines and 4 descriptions inside the exact character limits.',
    icon: 'Megaphone',
    provider: 'gemini',
    model: 'gemini-3-flash',
    temperature: 0.75,
    systemPrompt:
      'You are an elite Direct-Response Ad Copywriter & PPC Specialist. You create high-converting Meta Ads (Facebook & Instagram) using AIDA/PAS frameworks and Google Search Responsive Search Ads adhering strictly to character limits.',
    userPromptTemplate: `Generate a complete paid ad campaign package for:
Product/Offer: {{productOrOffer}}
${BRAND_BLOCK}
Target Objective: {{objective}}
Destination URL: {{destinationUrl}}

CRITICAL RULES:
1. Google headlines: exactly 15, each 30 characters or fewer.
2. Google descriptions: exactly 4, each 90 characters or fewer.
3. Meta headline: 45 characters or fewer. Meta description: 30 characters or fewer.
4. Provide Meta Ads Manager targeting categories (interests, behaviours).`,
    outputSchema: `{
  "metaAd": {
    "campaignObjective": "OUTCOME_LEADS",
    "framework": "AIDA",
    "primaryTextShort": "Hook-driven short copy",
    "primaryTextLong": "Problem-agitate-solution copy",
    "headline": "Max 45 chars",
    "description": "Max 30 chars",
    "ctaButton": "Learn More",
    "metaTargeting": { "interests": ["Interest"], "behaviors": ["Behavior"], "demographics": "Who to target" },
    "visualAdPrompt": "Prompt for the ad creative"
  },
  "googleAd": {
    "campaignName": "Campaign", "adGroupName": "Ad group",
    "headlines": ["15 headlines, each <= 30 chars"],
    "descriptions": ["4 descriptions, each <= 90 chars"],
    "keywords": ["+keyword"], "negativeKeywords": ["-free"],
    "displayPath1": "Offers", "displayPath2": "Special", "finalUrl": "https://example.com"
  }
}`,
    capabilities: ['brand_context', 'strategy_context', 'image_prompting'],
    inputs: [
      { key: 'productOrOffer', label: 'Product or offer', type: 'text', required: true },
      { key: 'objective', label: 'Objective', type: 'select', options: ['Conversions', 'Leads', 'Traffic', 'Awareness'], default: 'Conversions' },
      { key: 'destinationUrl', label: 'Destination URL', type: 'text' }
    ],
    pipelineStage: 6,
    sortOrder: 60
  },

  {
    key: 'poster_designer',
    name: 'Poster Art Director',
    role: 'Turns a template and brand guidelines into finished poster briefs',
    description:
      'Given a poster template and your brand guidelines, writes the headline, subhead and body for each poster along with a precise art-direction prompt in your palette and type style. Built for batches.',
    icon: 'Image',
    provider: 'gemini',
    model: 'gemini-3-flash',
    temperature: 0.85,
    systemPrompt:
      'You are an Art Director and Poster Copywriter. You design social posters that hold a single idea, respect brand guidelines exactly, and read clearly at thumbnail size. You never write more words than the layout can hold, and your art direction is specific enough for an image model to execute without guessing.',
    userPromptTemplate: `Design {{count}} posters for:
${BRAND_BLOCK}
Brand colours: {{palette}}
Audience: {{primaryICP}}
Content pillars: {{contentPillars}}

Template: {{templateName}} — {{templateBrief}}
Layout constraints: {{templateConstraints}}
{{extraContext}}

Rules:
1. Each poster carries ONE idea. No poster repeats another's angle.
2. Respect the word limits in the layout constraints exactly.
3. Art direction must name composition, subject, lighting, palette and type treatment.
4. Never put spelling-critical text into the image prompt; text is overlaid separately.`,
    outputSchema: `[
  {
    "templateKey": "the template used",
    "headline": "Short, punchy, within the layout's word limit",
    "subhead": "Optional supporting line",
    "body": "Optional short body copy",
    "callToAction": "CTA text",
    "caption": "The social caption to publish alongside the poster",
    "hashtags": ["#Tag1"],
    "imagePrompt": "Full art-direction prompt for the image generator",
    "paletteNotes": "Which brand colours dominate",
    "contentPillar": "Which pillar this serves"
  }
]`,
    capabilities: ['brand_context', 'strategy_context', 'image_prompting', 'bulk_generation', 'publish_posts'],
    inputs: [
      { key: 'count', label: 'How many posters', type: 'number', default: 10, help: 'Up to 50 per run.' },
      { key: 'templateName', label: 'Template', type: 'text', required: true },
      { key: 'extraContext', label: 'Anything else to work from', type: 'textarea' }
    ],
    pipelineStage: null,
    sortOrder: 70
  },

  {
    key: 'blog_writer',
    name: 'Long-form Blog Writer',
    role: 'Writes SEO-shaped articles ready to publish to WordPress',
    description:
      'Writes a full article with a real structure, internal heading hierarchy, meta description and slug — formatted as HTML so it can go straight to a connected WordPress site.',
    icon: 'FileText',
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    temperature: 0.7,
    systemPrompt:
      'You are a senior content writer who writes long-form articles that people actually finish. You write in the brand\'s voice, lead with the reader\'s problem, and use concrete specifics over generalities. You never pad, never use filler transitions, and never claim things the brand cannot support.',
    userPromptTemplate: `Write a {{wordCount}}-word article for:
${BRAND_BLOCK}
Audience: {{primaryICP}}
Their pain points: {{painPoints}}

Topic: {{topic}}
Target keyword: {{keyword}}
{{extraContext}}

Requirements:
1. Open with the reader's problem, not with the brand.
2. Use H2 and H3 headings that would make sense in a table of contents.
3. Include at least one concrete example or worked scenario.
4. Body must be valid HTML using h2, h3, p, ul, li, strong and blockquote only.
5. End with a call to action that fits the brand's voice.`,
    outputSchema: `{
  "title": "Article title",
  "slug": "url-slug",
  "metaDescription": "155 characters or fewer",
  "excerpt": "Two-sentence summary",
  "bodyHtml": "<h2>...</h2><p>...</p>",
  "tags": ["tag1", "tag2"],
  "categories": ["Category"],
  "featuredImagePrompt": "Art direction for the header image",
  "estimatedReadMinutes": 7
}`,
    capabilities: ['brand_context', 'strategy_context', 'image_prompting', 'publish_blog', 'web_search'],
    inputs: [
      { key: 'topic', label: 'Topic', type: 'text', required: true },
      { key: 'keyword', label: 'Target keyword', type: 'text' },
      { key: 'wordCount', label: 'Word count', type: 'number', default: 1200 },
      { key: 'extraContext', label: 'Anything else to work from', type: 'textarea' }
    ],
    pipelineStage: null,
    sortOrder: 80
  },

  {
    key: 'product_promo',
    name: 'Product Promo Writer',
    role: 'Turns catalogue products into promo posters and captions',
    description:
      'Reads products from a connected Shopify store and writes promo copy and poster art direction for each one — benefit-led, with the price and offer handled properly.',
    icon: 'ShoppingBag',
    provider: 'gemini',
    model: 'gemini-3-flash',
    temperature: 0.8,
    systemPrompt:
      'You are a retail copywriter who sells products by making the benefit obvious in one line. You write about what the product does for the buyer, never a spec list. You handle price and offers honestly and never invent claims, discounts or reviews that were not given to you.',
    userPromptTemplate: `Write promo material for these products:
${BRAND_BLOCK}
Brand colours: {{palette}}

Products:
{{products}}

Offer or angle: {{offer}}
{{extraContext}}

Rules:
1. One promo per product. Lead with the benefit, not the feature.
2. Only use the price, currency and offer given above. Never invent a discount.
3. Art direction should show the product in a setting its buyer recognises.`,
    outputSchema: `[
  {
    "productId": "the product id given",
    "productTitle": "the product title given",
    "headline": "Benefit-led headline",
    "subhead": "Supporting line",
    "price": "As supplied",
    "caption": "Social caption",
    "hashtags": ["#Tag"],
    "callToAction": "Shop now",
    "productUrl": "the url given",
    "imagePrompt": "Art direction placing the product in context"
  }
]`,
    capabilities: ['brand_context', 'product_catalog', 'image_prompting', 'bulk_generation', 'publish_posts'],
    inputs: [
      { key: 'offer', label: 'Offer or angle', type: 'text', help: 'e.g. "Summer sale, 20% off" — leave blank for evergreen promos.' },
      { key: 'extraContext', label: 'Anything else to work from', type: 'textarea' }
    ],
    pipelineStage: null,
    sortOrder: 90
  },

  {
    key: 'repurposer',
    name: 'Content Repurposer',
    role: 'Turns one asset into a week of formats',
    description:
      'Takes an article, a video transcript or a long post and cuts it into threads, carousels, short captions and hooks without losing the original argument.',
    icon: 'Recycle',
    provider: 'gemini',
    model: 'gemini-3-flash',
    temperature: 0.75,
    systemPrompt:
      'You are a content repurposing specialist. You find the strongest ideas inside a longer piece and rebuild them natively for each format. You never simply truncate the original, and you never invent facts that were not in the source.',
    userPromptTemplate: `Repurpose the source material below for:
${BRAND_BLOCK}

Source:
{{source}}

Produce {{count}} derivative pieces across formats.`,
    outputSchema: `[
  {
    "format": "thread | carousel | short-caption | hook | newsletter-blurb",
    "platform": "twitter | linkedin | instagram",
    "title": "Internal label",
    "content": "The piece itself, ready to publish",
    "hashtags": ["#Tag"],
    "visualPrompt": "Optional art direction"
  }
]`,
    capabilities: ['brand_context', 'image_prompting', 'bulk_generation', 'publish_posts'],
    inputs: [
      { key: 'source', label: 'Source material', type: 'textarea', required: true },
      { key: 'count', label: 'How many pieces', type: 'number', default: 6 }
    ],
    pipelineStage: null,
    sortOrder: 100
  }
];

export const BUILTIN_BY_KEY = new Map(BUILTIN_AGENTS.map(a => [a.key, a]));
