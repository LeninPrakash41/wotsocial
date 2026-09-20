import { runAgent } from "./agentRuntime";

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

/**
 * Generates a paid ad package through the registry's `paid_ads` agent.
 *
 * This used to inline its own prompt and, on any failure, return a fabricated
 * campaign — so an API outage looked identical to a successful generation, and
 * a customer could ship invented copy without knowing. It now runs the
 * published agent definition and lets failures surface, and it receives the
 * brand's learned voice and audience rather than just its name.
 */
export const generatePaidAdCampaign = async (params: {
  productOrOffer: string;
  brand: any;
  targetObjective?: string;
  destinationUrl?: string;
  provider?: 'gemini' | 'claude';
  model?: string;
}): Promise<PaidAdCampaignPackage> => {
  const { productOrOffer, brand, targetObjective = 'Conversions', destinationUrl } = params;
  const research = brand?.agentResearchData || {};

  const { result } = await runAgent<PaidAdCampaignPackage>('paid_ads', {
    productOrOffer,
    brandName: brand?.name,
    industry: brand?.industry,
    category: brand?.category,
    brandVoice: research?.siteAnalysis?.brandVoice || brand?.brandTone,
    guidelines: (brand?.guidelinesText || '').slice(0, 800),
    valueProposition: research?.siteAnalysis?.valueProposition,
    primaryICP: research?.audienceProfile?.primaryICP,
    painPoints: research?.audienceProfile?.painPoints,
    objective: targetObjective,
    destinationUrl: destinationUrl || brand?.websiteUrl || 'https://example.com'
  }, { provider: params.provider, brandId: brand?.id });

  // Meta and Google reject copy over their limits outright, so trim rather than
  // let a launch fail on a headline that is three characters too long.
  if (result.googleAd?.headlines) {
    result.googleAd.headlines = result.googleAd.headlines
      .map(h => (h.length > 30 ? `${h.slice(0, 27)}...` : h));
  }
  if (result.googleAd?.descriptions) {
    result.googleAd.descriptions = result.googleAd.descriptions
      .map(d => (d.length > 90 ? `${d.slice(0, 87)}...` : d));
  }
  if (result.metaAd?.headline && result.metaAd.headline.length > 45) {
    result.metaAd.headline = `${result.metaAd.headline.slice(0, 42)}...`;
  }
  if (result.metaAd?.description && result.metaAd.description.length > 30) {
    result.metaAd.description = `${result.metaAd.description.slice(0, 27)}...`;
  }

  return result;
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
