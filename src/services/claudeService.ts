import { safeParseJSON } from "./jsonParser";

export const getClaudeApiKey = (): string => {
  return (localStorage.getItem('claude_api_key') || '').trim();
};

export interface ClaudeMessageParams {
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
}

export const generateClaudeContent = async (params: ClaudeMessageParams): Promise<string> => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    throw new Error("Anthropic Claude API Key missing. Please set your API key in the Integrations page.");
  }

  const model = params.model || 'claude-3-5-sonnet-20241022';

  const body: any = {
    model,
    max_tokens: 4096,
    temperature: params.temperature ?? 0.7,
    messages: [
      {
        role: 'user',
        content: params.userPrompt
      }
    ]
  };

  if (params.systemPrompt) {
    body.system = params.systemPrompt;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || response.statusText;
    throw new Error(`Claude API error (${response.status}): ${message}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text || '';
  return text;
};

export const generateClaudeJSON = async <T>(params: ClaudeMessageParams): Promise<T> => {
  const jsonPrompt = `${params.userPrompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the requested schema. Do NOT wrap in markdown code blocks or add explanatory text outside the JSON.`;
  const rawText = await generateClaudeContent({ ...params, userPrompt: jsonPrompt });
  return safeParseJSON<T>(rawText);
};
