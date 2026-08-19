import { GoogleGenAI } from "@google/genai";
import { generateGeminiWithRetry } from "./geminiRetry";
import { safeParseJSON } from "./jsonParser";
import { generateClaudeJSON, getClaudeApiKey } from "./claudeService";

export interface BrandVoiceProfile {
  brandTone: string;
  brandPersonality: string;
  keyVocabulary: string[];
  formattingRules: string[];
  emojiGuidelines: string;
  targetICP: string;
  coreValueProps: string[];
  guidelinesText: string;
}

const getGeminiApiKey = (): string => {
  return (localStorage.getItem('gemini_api_key') || '').trim();
};

export const crawlAndExtractBrandVoice = async (params: {
  brandName: string;
  websiteUrl?: string;
  sampleText?: string;
  provider?: 'gemini' | 'claude';
}): Promise<BrandVoiceProfile> => {
  const { brandName, websiteUrl, sampleText, provider = 'gemini' } = params;

  const systemPrompt = `You are an elite Brand Strategist & Linguistic AI Agent. Your task is to analyze a website URL or text samples to extract the precise Brand Voice, Communication Guidelines, Key Vocabulary, Target Persona (ICP), and Core Value Propositions.`;

  const userPrompt = `Analyze the brand profile for:
Brand Name: ${brandName}
${websiteUrl ? `Website URL: ${websiteUrl}` : ''}
${sampleText ? `Sample Brand Content:\n${sampleText}` : ''}

Using web search or analyzing the provided content, determine:
1. Brand Tone (e.g., Authoritative yet accessible, Playful & Witty, Executive B2B).
2. Brand Personality (3 key adjectives).
3. Key Vocabulary & Terms (5 signature phrases or industry terms used).
4. Formatting Rules (e.g., short paragraphs, bullet points, no jargon).
5. Emoji Usage Guidelines.
6. Target ICP (Primary ideal customer profile).
7. Core Value Propositions (3 key promises).
8. Comprehensive Guidelines Text (A 3-paragraph summary of how this brand should sound).

Return ONLY a valid JSON object matching this schema:
{
  "brandTone": "Authoritative, insightful, data-driven",
  "brandPersonality": "Innovative, Bold, Reliable",
  "keyVocabulary": ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "formattingRules": ["Use short 1-2 sentence paragraphs", "Include 1 key takeaway bullet list"],
  "emojiGuidelines": "Use 2-3 minimal emojis per post (🚀, 💡, 📈)",
  "targetICP": "SaaS founders, VP of Marketing, Growth Leads",
  "coreValueProps": ["Value prop 1", "Value prop 2", "Value prop 3"],
  "guidelinesText": "Comprehensive voice guidelines summary paragraph..."
}`;

  if (provider === 'claude' && getClaudeApiKey()) {
    return await generateClaudeJSON<BrandVoiceProfile>({
      systemPrompt,
      userPrompt
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
      tools: websiteUrl ? [{ googleSearch: {} }] : undefined
    }
  });

  const text = response.text || '{}';
  return safeParseJSON<BrandVoiceProfile>(text);
};
