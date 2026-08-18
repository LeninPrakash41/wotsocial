import { GoogleGenAI } from "@google/genai";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateGeminiWithRetry(params: {
  ai: GoogleGenAI;
  model: string;
  contents: string;
  config?: any;
}): Promise<any> {
  const primaryModel = params.model;
  const candidateModels = Array.from(new Set([
    primaryModel,
    primaryModel.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ]));

  let lastError: any = null;

  for (const modelToTry of candidateModels) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await params.ai.models.generateContent({
          model: modelToTry,
          contents: params.contents,
          config: params.config
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errStr = String(err?.message || '') + JSON.stringify(err || '');
        const isTransient = errStr.includes('503') || errStr.includes('429') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || errStr.includes('RESOURCE_EXHAUSTED');

        if (isTransient) {
          console.warn(`[Gemini Retry] Model '${modelToTry}' attempt ${attempt}/3 hit 503/429 demand spike. Retrying in ${attempt * 1500}ms...`);
          await delay(attempt * 1500);
        } else {
          throw err;
        }
      }
    }
  }

  throw lastError;
}
