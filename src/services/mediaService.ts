export const getOpenArtApiKey = (): string => {
  return (localStorage.getItem('openart_api_key') || '').trim();
};

export const getSeedanceApiKey = (): string => {
  return (localStorage.getItem('seedance_api_key') || '').trim();
};

export interface VideoGenParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
}

export interface ImageGenParams {
  prompt: string;
  aspectRatio?: string;
  style?: string;
}

// OpenArt Video & Image Generation
export const generateOpenArtVideo = async (params: VideoGenParams): Promise<string> => {
  const apiKey = getOpenArtApiKey();
  if (!apiKey) {
    throw new Error("OpenArt API Key missing. Please configure your OpenArt API key in the Integrations page.");
  }

  const response = await fetch('https://api.openart.ai/v1/video/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio || '16:9',
      duration: params.duration || 5
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenArt Video API error (${response.status}): ${errorData.message || response.statusText}`);
  }

  const data = await response.json();
  const videoUrl = data.video_url || data.url || data.result?.url;

  if (!videoUrl && data.id) {
    // Poll for status if asynchronous
    return await pollOpenArtVideoStatus(data.id, apiKey);
  }

  if (!videoUrl) {
    throw new Error("OpenArt did not return a valid video URL.");
  }

  return videoUrl;
};

const pollOpenArtVideoStatus = async (taskId: string, apiKey: string): Promise<string> => {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(res => setTimeout(res, 4000));
    const res = await fetch(`https://api.openart.ai/v1/video/status/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'completed' && (data.video_url || data.url)) {
        return data.video_url || data.url;
      }
      if (data.status === 'failed') {
        throw new Error(`OpenArt video generation failed: ${data.error || 'Unknown error'}`);
      }
    }
  }
  throw new Error("OpenArt video generation timed out.");
};

export const generateOpenArtImage = async (params: ImageGenParams): Promise<string> => {
  const apiKey = getOpenArtApiKey();
  if (!apiKey) {
    throw new Error("OpenArt API Key missing. Please configure your OpenArt API key in the Integrations page.");
  }

  const response = await fetch('https://api.openart.ai/v1/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio || '1:1',
      style: params.style || 'photorealistic'
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenArt Image API error (${response.status}): ${errorData.message || response.statusText}`);
  }

  const data = await response.json();
  const imageUrl = data.image_url || data.url || data.result?.url || data.images?.[0]?.url;

  if (!imageUrl) {
    throw new Error("OpenArt did not return a valid image URL.");
  }

  return imageUrl;
};

// Seedance AI Video Generation
export const generateSeedanceVideo = async (params: VideoGenParams): Promise<string> => {
  const apiKey = getSeedanceApiKey();
  if (!apiKey) {
    throw new Error("Seedance API Key missing. Please configure your Seedance API key in the Integrations page.");
  }

  const response = await fetch('https://api.seedance.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      prompt: params.prompt,
      resolution: params.resolution || '720p',
      aspect_ratio: params.aspectRatio || '16:9',
      duration_seconds: params.duration || 5
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Seedance API error (${response.status}): ${errorData.message || errorData.error || response.statusText}`);
  }

  const data = await response.json();
  const videoUrl = data.video_url || data.url || data.download_url;

  if (!videoUrl && data.task_id) {
    return await pollSeedanceVideoStatus(data.task_id, apiKey);
  }

  if (!videoUrl) {
    throw new Error("Seedance did not return a valid video URL.");
  }

  return videoUrl;
};

const pollSeedanceVideoStatus = async (taskId: string, apiKey: string): Promise<string> => {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(res => setTimeout(res, 5000));
    const res = await fetch(`https://api.seedance.ai/v1/status/${taskId}`, {
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'x-api-key': apiKey 
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'completed' || data.status === 'succeeded') {
        return data.video_url || data.url || data.download_url;
      }
      if (data.status === 'failed') {
        throw new Error(`Seedance video generation failed: ${data.error || 'Unknown error'}`);
      }
    }
  }
  throw new Error("Seedance video generation timed out.");
};
