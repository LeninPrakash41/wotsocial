import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const getApiKey = () => {
  return localStorage.getItem('gemini_api_key') as string;
};

export const fetchSuggestions = async (brandData: any, query?: string) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  
  const ai = new GoogleGenAI({ apiKey });
  
  const searchContext = query 
    ? `specifically related to "${query}"` 
    : `that are HIGHLY RELEVANT to clients and customers in the ${brandData.industry || 'general'} industry and ${brandData.category || 'business'} category. Focus on what their target audience is currently searching for, their pain points, and industry news that affects them directly.`;

  const prompt = `Using Google Search, identify 5 current trending topics, news stories, or viral discussions ${searchContext}.
  
  Brand Context:
  - Name: ${brandData.name}
  - Industry: ${brandData.industry || 'N/A'}
  - Category: ${brandData.category || 'N/A'}
  - Brand Tone: ${brandData.brandTone || 'N/A'}
  - Brand Personality: ${brandData.brandPersonality || 'N/A'}
  - Guidelines/Mission: ${brandData.guidelinesText?.substring(0, 500) || 'N/A'}
  
  For each topic, provide:
  1. A catchy title.
  2. A brief explanation of why it's trending and EXACTLY how it relates to this specific brand's audience and services.
  3. The type (trend, news, or holiday).
  
  IMPORTANT: Return ONLY a valid JSON array of objects.
  Format: [{"title": "...", "description": "...", "type": "..."}]`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  if (!response.text) {
    throw new Error("No content generated");
  }

  const text = response.text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const cleanJson = jsonMatch ? jsonMatch[0] : '[]';
  
  const result = JSON.parse(cleanJson);
  return Array.isArray(result) ? result : [];
};

export const planCalendar = async (days: number, brand: any) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Act as a strategic social media manager. Create a ${days}-day content calendar for the following brand.
  
  Brand Context:
  - Name: ${brand.name}
  - Industry: ${brand.industry || 'N/A'}
  - Category: ${brand.category || 'N/A'}
  - Tone: ${brand.brandTone}
  - Personality: ${brand.brandPersonality}
  - Guidelines: ${brand.guidelinesText?.substring(0, 500) || 'N/A'}
  
  Instructions:
  1. Create a cohesive narrative across the ${days} days.
  2. Vary the content types (e.g., educational, promotional, engaging, behind-the-scenes).
  3. Specify the best platform for each post.
  4. Suggest the type of media (image, video, or none).
  
  IMPORTANT: Return ONLY a valid JSON array of objects.
  Format: [{"day": 1, "topic": "...", "content": "...", "mediaType": "image|video|none", "platform": "linkedin|twitter|instagram|facebook"}]`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: prompt
  });

  const text = response.text || '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const cleanJson = jsonMatch ? jsonMatch[0] : '[]';
  
  const result = JSON.parse(cleanJson);
  return Array.isArray(result) ? result : [];
};

export const generateContent = async (params: {
  finalTopic: string;
  isTrend: boolean;
  brand: any;
  selectedPlatforms: string[];
  mediaType: 'none' | 'image' | 'video';
  aspectRatio: string;
  quality: string;
  videoResolution: string;
  modelName?: string;
}) => {
  const { finalTopic, isTrend, brand, selectedPlatforms, mediaType, aspectRatio, quality, videoResolution, modelName } = params;
  
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing. Please set your API key in the Integrations page.");
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Generate Text Content
  const textPrompt = `You are an expert social media manager. Write a highly engaging, humanized social media post about "${finalTopic}".
  
  Tailor the content specifically for the following platforms: ${selectedPlatforms.join(', ')}.
  
  ${isTrend ? 'This is a trending topic. Use Google Search to find the latest details, facts, or sentiment about this topic to ensure the post is accurate and timely.' : ''}
  
  Brand Context:
  - Name: ${brand.name}
  - Industry: ${brand.industry || 'N/A'}
  - Category: ${brand.category || 'N/A'}
  - Tone: ${brand.brandTone || 'Professional but approachable'}
  - Personality: ${brand.brandPersonality || 'Helpful and innovative'}
  
  CRITICAL INSTRUCTIONS:
  1. DO NOT use markdown formatting like asterisks (**) for bolding. Use plain text only.
  2. DO NOT include any image descriptions, suggestions, or placeholders like [Image here].
  3. The post should NOT sound like AI. Make it relatable, use appropriate spacing, and include relevant hashtags for each platform.
  4. If multiple platforms are selected, provide a single cohesive post that works well across all of them.`;

  const textResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: textPrompt,
    config: isTrend ? { tools: [{ googleSearch: {} }] } : undefined
  });
  
  let generatedText = textResponse.text || '';
  let generatedMediaUrl = '';
  let videoDownloadLink = '';

  // Generate Media if requested
  if (mediaType === 'image') {
    const imagePrompt = `A high-quality, professional social media graphic for ${brand.name}. 
    Subject: ${finalTopic}. 
    Brand Aesthetic: ${brand.brandTone}, ${brand.brandPersonality}.
    Colors: Primary: ${brand.primaryColor || 'N/A'}, Secondary: ${brand.secondaryColor || 'N/A'}, Accent: ${brand.accentColor || 'N/A'}. 
    Additional Palette: ${brand.brandColors?.join(', ') || 'modern professional palette'}. 
    Style: Clean, high-end photography or professional graphic design. 
    NO TEXT OVERLAYS. NO PLACEHOLDERS.`;
    
    const imageResponse = await ai.models.generateContent({
      model: modelName || 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: imagePrompt }] },
      config: {
        imageConfig: { 
          aspectRatio: aspectRatio as any, 
          imageSize: quality as any 
        }
      }
    });

    for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        generatedMediaUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  } else if (mediaType === 'video') {
    const videoPrompt = `A high-quality, professional short video clip for a brand named ${brand.name}. Topic: ${finalTopic}. Style: Cinematic, modern, clean.`;
    
    let operation = await ai.models.generateVideos({
      model: modelName || 'veo-3.1-fast-generate-preview',
      prompt: videoPrompt,
      config: {
        numberOfVideos: 1,
        resolution: videoResolution as any,
        aspectRatio: aspectRatio as any
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri || '';
    if (downloadLink) {
      // Fetch the video with the API key
      const videoResponse = await fetch(downloadLink, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
      });
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      
      const videoBlob = await videoResponse.blob();
      videoDownloadLink = URL.createObjectURL(videoBlob);
    }
  }

  return { text: generatedText, mediaUrl: generatedMediaUrl, videoDownloadLink };
};

export const analyzeBrand = async (websiteUrl: string, guidelinesText: string) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  
  const ai = new GoogleGenAI({ apiKey });
  
  let prompt = `Analyze the following brand information to determine its industry, business category, tone, personality, and primary, secondary, and accent colors (in hex format).
  
  Brand Guidelines/Text: ${guidelinesText}
  
  Return a JSON object with the following structure:
  {
    "industry": "The broad industry (e.g., Technology, Healthcare, Fashion).",
    "category": "The specific business category (e.g., SaaS, E-commerce, Personal Training).",
    "brandTone": "A short description of the brand's tone of voice (e.g., Professional, Witty, Empathetic).",
    "brandPersonality": "A short description of the brand's personality traits.",
    "primaryColor": "#FFFFFF",
    "secondaryColor": "#000000",
    "accentColor": "#FF0000"
  }`;

  const config: any = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        industry: { type: Type.STRING },
        category: { type: Type.STRING },
        brandTone: { type: Type.STRING },
        brandPersonality: { type: Type.STRING },
        primaryColor: { type: Type.STRING },
        secondaryColor: { type: Type.STRING },
        accentColor: { type: Type.STRING }
      },
      required: ['industry', 'category', 'brandTone', 'brandPersonality', 'primaryColor', 'secondaryColor', 'accentColor']
    }
  };

  if (websiteUrl) {
    config.tools = [{ urlContext: {} }];
    prompt += `\n\nWebsite URL to analyze: ${websiteUrl}`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config
  });

  return JSON.parse(response.text || '{}');
};

export const analyzePerformance = async (performanceData: any, audienceSummary: any, brandName: string) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Analyze the following social media performance and audience data for the brand "${brandName}".
  
  Performance Data: ${JSON.stringify(performanceData)}
  Audience Data: ${JSON.stringify(audienceSummary)}
  
  Provide insights into:
  1. What content resonates best (media type, themes).
  2. Top performing content types.
  3. Audience demographics and how they differ by platform.
  4. Actionable recommendations for future strategy based on WHO is watching.
  
  Return a JSON object:
  {
    "insightText": "A summary of overall performance and audience alignment.",
    "recommendations": ["Rec 1", "Rec 2"],
    "topPerformingThemes": ["Theme 1", "Theme 2"]
  }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insightText: { type: Type.STRING },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          topPerformingThemes: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['insightText', 'recommendations', 'topPerformingThemes']
      }
    }
  });

  return JSON.parse(response.text || '{}');
};
