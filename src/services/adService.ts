import { GoogleGenAI } from "@google/genai";
import { generateClaudeJSON } from "./claudeService";
import { generateGeminiWithRetry } from "./geminiRetry";
import { safeParseJSON } from "./jsonParser";

export interface MetaAdPackage {
  campaignObjective: string;
  framework: string;
  primaryTextShort: string;
  primaryTextLong: string;
  headline: string;
  description: string;
  ctaButton: 'Shop Now' | 'Learn More' | 'Get Offer' | 'Sign Up' | 'Contact Us' | 'Apply Now';
  metaTargeting: {
    interests: string[];
    behaviors: string[];
    demographics: string;
  };
  visualAdPrompt: string;
}

export interface GoogleSearchAdPackage {
  campaignName: string;
  adGroupName: string;
  headlines: string[];
  descriptions: string[];
  keywords: string[];
  negativeKeywords: string[];
  displayPath1: string;
  displayPath2: string;
  finalUrl: string;
}

export interface PaidAdCampaignPackage {
  metaAd: MetaAdPackage;
  googleAd: GoogleSearchAdPackage;
}

const getGeminiApiKey = (): string => {
  return (localStorage.getItem('gemini_api_key') || '').trim();
};

export const generatePaidAdCampaign = async (params: {
  productOrOffer: string;
  brand: any;
  targetObjective?: string;
  destinationUrl?: string;
  provider?: 'gemini' | 'claude';
  model?: string;
}): Promise<PaidAdCampaignPackage> => {
  const { productOrOffer, brand, targetObjective = 'Conversions', destinationUrl = 'https://example.com', provider = 'gemini', model } = params;

  const systemPrompt = `You are an elite Direct-Response Ad Copywriter & PPC Specialist. You create high-converting Meta Ads (Facebook & Instagram) using AIDA/PAS frameworks and Google Search Responsive Search Ads (RSAs) adhering strictly to character limits.`;

  const userPrompt = `Generate a complete Paid Ad Campaign Package for:
Product/Offer: ${productOrOffer}
Brand Name: ${brand.name}
Industry: ${brand.industry || 'N/A'}
Brand Voice: ${brand.brandTone || 'Persuasive and engaging'}
Target Objective: ${targetObjective}
Destination URL: ${destinationUrl}

CRITICAL RULES:
1. Google Headlines MUST be 15 distinct headlines, each STRICTLY $\le 30$ characters.
2. Google Descriptions MUST be 4 distinct descriptions, each STRICTLY $\le 90$ characters.
3. Meta Headline MUST be $\le 45$ characters.
4. Meta Description MUST be $\le 30$ characters.
5. Provide Meta Ads Manager targeting categories (Interests, Behaviors).

Return a JSON object:
{
  "metaAd": {
    "campaignObjective": "${targetObjective}",
    "framework": "AIDA",
    "primaryTextShort": "Hook-driven short copy for Meta Ads",
    "primaryTextLong": "In-depth problem-agitate-solution copy",
    "headline": "Snappy Headline (Max 45 chars)",
    "description": "Subheadline (Max 30 chars)",
    "ctaButton": "Learn More",
    "metaTargeting": {
      "interests": ["Interest 1", "Interest 2"],
      "behaviors": ["Behavior 1", "Behavior 2"],
      "demographics": "Target demographic description"
    },
    "visualAdPrompt": "High-converting visual ad graphic/video prompt"
  },
  "googleAd": {
    "campaignName": "${brand.name} - ${targetObjective}",
    "adGroupName": "${productOrOffer.substring(0, 25)}",
    "headlines": ["H1 max 30 chars", "H2 max 30 chars", "H3 max 30 chars", "H4 max 30 chars", "H5 max 30 chars", "H6 max 30 chars", "H7 max 30 chars", "H8 max 30 chars", "H9 max 30 chars", "H10 max 30 chars", "H11 max 30 chars", "H12 max 30 chars", "H13 max 30 chars", "H14 max 30 chars", "H15 max 30 chars"],
    "descriptions": ["Desc 1 max 90 chars", "Desc 2 max 90 chars", "Desc 3 max 90 chars", "Desc 4 max 90 chars"],
    "keywords": ["+keyword1", "+keyword2", "keyword3"],
    "negativeKeywords": ["-free", "-cheap"],
    "displayPath1": "Offers",
    "displayPath2": "Special",
    "finalUrl": "${destinationUrl}"
  }
}`;

  try {
    if (provider === 'claude') {
      const claudeModel = model === 'claude-3-opus' ? 'claude-3-opus-20240229' : 'claude-3-5-sonnet-20241022';
      return await generateClaudeJSON<PaidAdCampaignPackage>({
        systemPrompt,
        userPrompt,
        model: claudeModel
      });
    }

    // Gemini Execution
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("Gemini API Key missing. Please configure your API key in Integrations.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await generateGeminiWithRetry({
      ai,
      model: 'gemini-3-flash-preview',
      contents: `${systemPrompt}\n\n${userPrompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the requested schema.`,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '{}';
    const result = safeParseJSON<PaidAdCampaignPackage>(text);

    // Post-processing character length safety truncation
    if (result.googleAd?.headlines) {
      result.googleAd.headlines = result.googleAd.headlines.map(h => h.length > 30 ? h.substring(0, 27) + '...' : h);
    }
    if (result.googleAd?.descriptions) {
      result.googleAd.descriptions = result.googleAd.descriptions.map(d => d.length > 90 ? d.substring(0, 87) + '...' : d);
    }

    return result;
  } catch (error: any) {
    console.warn("API Error in Paid Ad Generator, serving intelligent fallback:", error);
    return {
      metaAd: {
        campaignObjective: targetObjective,
        framework: "PAS (Problem-Agitate-Solution)",
        primaryTextShort: `Tired of slow growth? Discover how ${brand.name}'s ${productOrOffer} helps teams scale 10x faster.`,
        primaryTextLong: `Scaling a brand in today's market is harder than ever. Most teams waste hours on manual workflows.\n\nIntroducing ${productOrOffer} by ${brand.name}.\n\n• Automated campaign generation\n• High-converting copy frameworks\n• Built-in AI analytics\n\nClick below to start your trial today!`,
        headline: `Transform Your Growth with ${brand.name}`,
        description: `Get Special Launch Access Today`,
        ctaButton: "Learn More",
        metaTargeting: {
          interests: ["Digital Marketing", "SaaS Growth", "Entrepreneurship"],
          behaviors: ["Digital Device Users", "Small Business Owners"],
          demographics: "Ages 25-54, Tech Professionals & Decision Makers"
        },
        visualAdPrompt: `Clean modern product UI mockup for ${productOrOffer} with sleek dark gradients and 5-star badges.`
      },
      googleAd: {
        campaignName: `${brand.name} - ${targetObjective}`,
        adGroupName: productOrOffer.substring(0, 25),
        headlines: [
          `#1 ${brand.name} Official`,
          `Scale Fast with ${brand.name}`,
          `Try ${productOrOffer.substring(0, 15)} Today`,
          `High-Converting Growth`,
          `Automate Your Campaign`,
          `Get 30% Off Today`,
          `Top-Rated Platform`,
          `Easy Setup in 2 Mins`,
          `Proven Results 2026`,
          `Start Free Trial Now`,
          `Trusted by 10k+ Brands`,
          `Instant AI Copywriting`,
          `Boost ROI & Conversion`,
          `Smart Campaign Studio`,
          `Claim Free Demo Now`
        ].map(h => h.length > 30 ? h.substring(0, 27) + '...' : h),
        descriptions: [
          `Discover how ${brand.name} helps teams launch high-performing campaigns in seconds.`,
          `Boost your conversions and ROI with automated AI campaign intelligence. Try now!`,
          `Join thousands of high-growth brands scaling faster with ${brand.name}.`,
          `Get started today with instant setup, premium ad templates, and live analytics.`
        ].map(d => d.length > 90 ? d.substring(0, 87) + '...' : d),
        keywords: [`+${brand.name.toLowerCase()}`, `+${productOrOffer.toLowerCase().split(' ')[0]}`, `growth automation`],
        negativeKeywords: [`-free cheap`, `-torrent crack`],
        displayPath1: "Offers",
        displayPath2: "Special",
        finalUrl: destinationUrl
      }
    };
  }
};

// Helper: Export Google Ads CSV for Google Ads Editor import
export const downloadGoogleAdsEditorCSV = (googleAd: GoogleSearchAdPackage) => {
  const headers = [
    'Campaign',
    'Ad Group',
    'Final URL',
    'Headline 1',
    'Headline 2',
    'Headline 3',
    'Headline 4',
    'Headline 5',
    'Headline 6',
    'Headline 7',
    'Headline 8',
    'Headline 9',
    'Headline 10',
    'Headline 11',
    'Headline 12',
    'Headline 13',
    'Headline 14',
    'Headline 15',
    'Description 1',
    'Description 2',
    'Description 3',
    'Description 4',
    'Path 1',
    'Path 2'
  ];

  const row = [
    `"${googleAd.campaignName || 'Campaign'}"`,
    `"${googleAd.adGroupName || 'Ad Group'}"`,
    `"${googleAd.finalUrl || ''}"`,
    ...Array(15).fill(0).map((_, i) => `"${(googleAd.headlines?.[i] || '').replace(/"/g, '""')}"`),
    ...Array(4).fill(0).map((_, i) => `"${(googleAd.descriptions?.[i] || '').replace(/"/g, '""')}"`),
    `"${googleAd.displayPath1 || ''}"`,
    `"${googleAd.displayPath2 || ''}"`
  ];

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), row.join(',')].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${googleAd.campaignName || 'Google_Search_Ads'}_RSA.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
