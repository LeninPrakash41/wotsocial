import { GoogleGenAI } from "@google/genai";
import { generateGeminiWithRetry } from "./geminiRetry";
import { safeParseJSON } from "./jsonParser";
import { generateClaudeJSON, getClaudeApiKey } from "./claudeService";

export interface CarouselSlide {
  slideNumber: number;
  slideTitle: string;
  slideBody: string;
  visualPrompt: string;
}

export interface RepurposedMultiChannelPackage {
  title: string;
  sourceType: string;
  linkedinPost: string;
  twitterThread: string[];
  instagramPackage: {
    caption: string;
    hashtags: string[];
    carouselSlides: CarouselSlide[];
  };
  emailNewsletter: {
    subjectLine: string;
    previewText: string;
    bodyMarkdown: string;
  };
  videoScript: {
    title: string;
    hook: string;
    scriptBody: string;
    visualCues: string[];
    callToAction: string;
  };
  metaAdCopy: {
    headline: string;
    primaryText: string;
    ctaButton: string;
  };
}

const getGeminiApiKey = (): string => {
  return (localStorage.getItem('gemini_api_key') || '').trim();
};

export const repurposeContentToMultiChannel = async (params: {
  inputText: string;
  inputType?: 'url' | 'document' | 'blog' | 'topic';
  brand: any;
  provider?: 'gemini' | 'claude';
  model?: string;
}): Promise<RepurposedMultiChannelPackage> => {
  const { inputText, inputType = 'blog', brand, provider = 'gemini', model } = params;

  const systemPrompt = `You are a master Multi-Channel Content Strategist. Your mission is to take a single piece of content (URL, long-form blog, doc, or topic brief) and repurpose it into 6 distinct, platform-native asset formats.`;

  const research = brand?.agentResearchData || {};
  const brandContext = [
    `Brand Name: ${brand?.name || 'Brand'}`,
    `Brand Industry: ${brand?.industry || 'Business'}`,
    `Brand Voice: ${research?.siteAnalysis?.brandVoice || brand?.brandTone || 'Professional & Engaging'}`,
    research?.siteAnalysis?.valueProposition && `What the brand does: ${research.siteAnalysis.valueProposition}`,
    research?.audienceProfile?.primaryICP && `Who is reading: ${research.audienceProfile.primaryICP}`,
    research?.audienceProfile?.painPoints?.length &&
      `Their pain points: ${research.audienceProfile.painPoints.join(', ')}`
  ].filter(Boolean).join('\n');

  const userPrompt = `Repurpose the following source content into a complete multi-channel asset package for:
${brandContext}

SOURCE CONTENT (${inputType}):
${inputText}

REQUIRED OUTPUT FORMATS:
1. LinkedIn Post (Long-form thought leadership post with line breaks and CTA).
2. Twitter / X Thread (Exactly 5 numbered tweets).
3. Instagram Package (Engaging caption, 5-slide carousel outline with slide title, body, and visual graphic prompt).
4. Email Newsletter Digest (Catchy subject line, preview text, and newsletter draft).
5. YouTube Short / TikTok Script (60-second video script with Hook, Script Text, Visual Cues, and CTA).
6. Meta Ad Copy (Snappy headline, high-converting primary text, CTA button).

Return ONLY a valid JSON object matching this structure:
{
  "title": "Core Topic Title",
  "sourceType": "${inputType}",
  "linkedinPost": "Full LinkedIn post copy...",
  "twitterThread": ["Tweet 1/5...", "Tweet 2/5...", "Tweet 3/5...", "Tweet 4/5...", "Tweet 5/5..."],
  "instagramPackage": {
    "caption": "Instagram caption copy...",
    "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
    "carouselSlides": [
      { "slideNumber": 1, "slideTitle": "Hook Title", "slideBody": "Slide content...", "visualPrompt": "Graphic prompt..." },
      { "slideNumber": 2, "slideTitle": "Point 1", "slideBody": "Slide content...", "visualPrompt": "Graphic prompt..." },
      { "slideNumber": 3, "slideTitle": "Point 2", "slideBody": "Slide content...", "visualPrompt": "Graphic prompt..." },
      { "slideNumber": 4, "slideTitle": "Point 3", "slideBody": "Slide content...", "visualPrompt": "Graphic prompt..." },
      { "slideNumber": 5, "slideTitle": "Summary & CTA", "slideBody": "Slide content...", "visualPrompt": "Graphic prompt..." }
    ]
  },
  "emailNewsletter": {
    "subjectLine": "Catchy subject line",
    "previewText": "Preview snippet",
    "bodyMarkdown": "Full email body markdown..."
  },
  "videoScript": {
    "title": "Short Video Title",
    "hook": "0-3s Hook text",
    "scriptBody": "Main spoken script...",
    "visualCues": ["Cut to screen recording", "Text overlay on screen"],
    "callToAction": "Subscribe / Link in bio"
  },
  "metaAdCopy": {
    "headline": "Ad Headline (Max 45 chars)",
    "primaryText": "Ad Primary Text...",
    "ctaButton": "Learn More"
  }
}`;

  try {
    if (provider === 'claude' && getClaudeApiKey()) {
      return await generateClaudeJSON<RepurposedMultiChannelPackage>({
        systemPrompt,
        userPrompt,
        model: model === 'claude-3-opus' ? 'claude-3-opus-20240229' : 'claude-3-5-sonnet-20241022'
      });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("Gemini API Key missing. Please set your API key in the Integrations page.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await generateGeminiWithRetry({
      ai,
      model: 'gemini-3-flash-preview',
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        tools: inputType === 'url' ? [{ googleSearch: {} }] : undefined
      }
    });

    const text = response.text || '{}';
    return safeParseJSON<RepurposedMultiChannelPackage>(text);
  } catch (error: any) {
    // No fabricated package here: repurposed copy goes out under the brand's
    // name, and a fallback that looks like real output is worse than an error.
    throw new Error(
      `Content repurposing failed: ${error?.message || String(error)}. Nothing was generated — try again, or check your API key in Integrations.`
    );
  }
};
