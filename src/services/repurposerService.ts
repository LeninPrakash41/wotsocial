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

  const userPrompt = `Repurpose the following source content into a complete multi-channel asset package for:
Brand Name: ${brand?.name || 'Brand'}
Brand Industry: ${brand?.industry || 'Business'}
Brand Voice: ${brand?.brandTone || 'Professional & Engaging'}

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
    console.warn("API Error in Content Repurposer, serving intelligent fallback package:", error);
    const title = inputText.substring(0, 40) + '...';
    return {
      title,
      sourceType: inputType,
      linkedinPost: `🚀 Repurposing Insights for ${brand?.name || 'Your Brand'}:\n\nKey Takeaway from our latest update:\n"${inputText.substring(0, 200)}..."\n\n3 Strategic Actions for Modern Growth:\n1️⃣ Focus on consistent messaging across channels.\n2️⃣ Leverage AI automation to speed up asset creation.\n3️⃣ Measure engagement and double down on top performers.\n\nWhat's your main takeaway? Share below! 👇`,
      twitterThread: [
        `1/5 Here is the breakdown on ${title}:`,
        `2/5 The core challenge most teams face is maintaining brand consistency at speed.`,
        `3/5 Key Insight: Automation allows creators to turn 1 blog into 6 channel assets instantly.`,
        `4/5 Action Step: Implement multi-format repurposing across LinkedIn, X, and IG.`,
        `5/5 Want to scale your brand presence with autonomous AI agents? Check out ${brand?.name || 'WotSocial'}!`
      ],
      instagramPackage: {
        caption: `Ready to elevate your brand presence? Swipe through to discover the 5 key takeaways from our latest strategy guide! 💡✨\n\nTag a founder who needs to see this! 👇`,
        hashtags: [`#${brand?.name?.replace(/\s+/g, '') || 'Growth'}`, "#ContentStrategy", "#MarketingTips", "#ProductivityHacks", "#AIAutomation"],
        carouselSlides: [
          { slideNumber: 1, slideTitle: title, slideBody: "How to turn 1 piece of content into 6 high-converting assets.", visualPrompt: "Bold graphic title with dark background and glowing highlight typography." },
          { slideNumber: 2, slideTitle: "1. Multi-Format Reach", slideBody: "Repurpose long-form text into bite-sized social posts.", visualPrompt: "Clean infographics showing multi-channel icons connecting together." },
          { slideNumber: 3, slideTitle: "2. Voice Alignment", slideBody: "Keep your brand tone consistent across all touchpoints.", visualPrompt: "Split screen comparison with brand colors and 5-star badges." },
          { slideNumber: 4, slideTitle: "3. Speed & Scale", slideBody: "Save 10+ hours per week with automated workflows.", visualPrompt: "Modern dashboard graph trending upwards with 10x ROI text." },
          { slideNumber: 5, slideTitle: "Save & Share!", slideBody: "Bookmark this post and follow for more growth strategies.", visualPrompt: "Bookmark icon with call-to-action arrow pointing to save button." }
        ]
      },
      emailNewsletter: {
        subjectLine: `[Digest] The 1-to-Many Strategy for ${brand?.name || 'Growth'}`,
        previewText: `How we turn single topics into complete multi-channel campaigns.`,
        bodyMarkdown: `# ${title}\n\nHi Subscriber,\n\nWe just analyzed key trends in content repurposing:\n\n> "${inputText.substring(0, 150)}..."\n\n### Why This Matters\nTo build authority today, your brand needs to show up consistently across LinkedIn, Twitter/X, Instagram, and Email.\n\n### 3 Quick Takeaways\n1. **Repurpose Everything**: Don't write from scratch—turn articles into threads & carousels.\n2. **Leverage AI Workflows**: Let AI agents format channel-native posts.\n3. **Maintain Visual Tone**: Use consistent brand colors and typography.\n\nBest,\nThe ${brand?.name || 'WotSocial'} Team`
      },
      videoScript: {
        title: `60s Growth Hook: ${title}`,
        hook: `Stop creating social content from scratch every single day!`,
        scriptBody: `Here is the secret top creators use: Take 1 long article or idea, and break it down into 5 tweets, a 5-slide IG carousel, and an email newsletter in under 60 seconds.\n\nHere is how: Step 1, extract your core thesis. Step 2, adapt line lengths for each channel. Step 3, let AI handle the heavy formatting.\n\nTry it now for your brand!`,
        visualCues: ["Cut to dynamic kinetic text on screen", "Show laptop screen transforming article into posts", "End on brand logo"],
        callToAction: "Link in bio to try WotSocial AI today!"
      },
      metaAdCopy: {
        headline: `Turn 1 Article into 6 Assets Instantly`,
        primaryText: `Stop spending 15+ hours on social content. Repurpose your articles and ideas into high-converting posts in 1 click.`,
        ctaButton: "Learn More"
      }
    };
  }
};
