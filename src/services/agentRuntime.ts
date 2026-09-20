/**
 * Executes agents from the registry.
 *
 * The definition — prompt, model, temperature, output shape, capabilities — is
 * whatever the customer last published, so editing an agent in the studio
 * genuinely changes what runs. Nothing here falls back to a canned result: if
 * the model call fails, the caller is told.
 */
import { GoogleGenAI } from '@google/genai';
import { generateGeminiWithRetry } from './geminiRetry';
import { safeParseJSON } from './jsonParser';
import { generateClaudeContent } from './claudeService';
import { agentsApi, Agent } from './studioApi';

export type TemplateVars = Record<string, string | number | string[] | undefined | null>;

const getGeminiKey = () => (localStorage.getItem('gemini_api_key') || '').trim();
const getClaudeKey = () => (localStorage.getItem('claude_api_key') || '').trim();

/** Which providers this workspace can currently run. */
export const availableProviders = (): ('gemini' | 'claude')[] => {
  const out: ('gemini' | 'claude')[] = [];
  if (getGeminiKey()) out.push('gemini');
  if (getClaudeKey()) out.push('claude');
  return out;
};

const stringify = (value: TemplateVars[string]): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return String(value);
};

/**
 * Fills `{{placeholders}}`, then drops any line whose only content was an
 * unfilled variable — otherwise the model receives "Industry:" with nothing
 * after it and tends to invent a value.
 */
export const fillTemplate = (template: string, vars: TemplateVars): string => {
  const filled = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => stringify(vars[key]));
  return filled
    .split('\n')
    .filter(line => !/^\s*[\w /&()-]+:\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** Placeholders in the template that no value was supplied for. */
export const missingVariables = (template: string, vars: TemplateVars): string[] => {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    const key = match[1];
    if (!stringify(vars[key])) found.add(key);
  }
  return [...found];
};

const cache = new Map<string, { agent: Agent; at: number }>();
const CACHE_MS = 30_000;

/** Published definitions change rarely; a short cache keeps batches snappy. */
export const loadPublishedAgent = async (key: string, force = false): Promise<Agent> => {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.agent;

  const { agent } = await agentsApi.published(key);
  cache.set(key, { agent, at: Date.now() });
  return agent;
};

export const clearAgentCache = () => cache.clear();

export interface RunOptions {
  /** Overrides the published provider, e.g. when only one key is configured. */
  provider?: 'gemini' | 'claude';
  brandId?: string;
  /** Set false inside a batch, where one log line per item is noise. */
  logRun?: boolean;
  signal?: AbortSignal;
}

export class AgentRunError extends Error {
  agentKey: string;
  constructor(agentKey: string, message: string) {
    super(message);
    this.name = 'AgentRunError';
    this.agentKey = agentKey;
  }
}

/**
 * Runs one agent and returns its parsed JSON output.
 * `T` is the caller's expectation of the agent's declared output schema.
 */
export const runAgent = async <T>(
  agentKey: string,
  vars: TemplateVars,
  options: RunOptions = {}
): Promise<{ result: T; agent: Agent; durationMs: number }> => {
  const startedAt = Date.now();
  const agent = await loadPublishedAgent(agentKey);

  const geminiKey = getGeminiKey();
  const claudeKey = getClaudeKey();

  // Honour the published provider when its key exists, otherwise fall back to
  // whichever one is configured — and say so rather than failing silently.
  let provider = options.provider || agent.provider;
  if (provider === 'gemini' && !geminiKey) provider = claudeKey ? 'claude' : 'gemini';
  if (provider === 'claude' && !claudeKey) provider = geminiKey ? 'gemini' : 'claude';

  if (provider === 'gemini' && !geminiKey) {
    throw new AgentRunError(agentKey, 'No Gemini API key is configured. Add one in Integrations to run this agent.');
  }
  if (provider === 'claude' && !claudeKey) {
    throw new AgentRunError(agentKey, 'No Claude API key is configured. Add one in Integrations to run this agent.');
  }

  const userPrompt = fillTemplate(agent.userPromptTemplate, vars);
  const schemaBlock = agent.outputSchema
    ? `\n\nReturn JSON matching exactly this shape:\n${agent.outputSchema}`
    : '';

  const log = async (status: 'completed' | 'failed', error?: string) => {
    if (options.logRun === false) return;
    try {
      await agentsApi.logRun(agent.id, {
        brandId: options.brandId,
        status,
        inputs: vars,
        error,
        durationMs: Date.now() - startedAt
      });
    } catch {
      /* Logging must never break a run. */
    }
  };

  try {
    let raw: string;

    if (provider === 'claude') {
      raw = await generateClaudeContent({
        systemPrompt: agent.systemPrompt,
        userPrompt: `${userPrompt}${schemaBlock}\n\nReturn ONLY the JSON. No markdown fences, no commentary.`,
        model: agent.model.startsWith('claude') ? agent.model : 'claude-sonnet-4-5',
        temperature: agent.temperature
      });
    } else {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const useSearch = agent.capabilities.includes('web_search');

      const response = await generateGeminiWithRetry({
        ai,
        model: agent.model.startsWith('gemini') ? agent.model : 'gemini-3-flash-preview',
        contents: `${agent.systemPrompt}\n\n${userPrompt}${schemaBlock}\n\nReturn ONLY valid JSON.`,
        config: useSearch
          // Search grounding and forced JSON output are mutually exclusive on
          // Gemini, so a grounded agent gets its JSON parsed out of the text.
          ? { tools: [{ googleSearch: {} }], temperature: agent.temperature }
          : { responseMimeType: 'application/json', temperature: agent.temperature }
      });
      raw = response.text || '';
    }

    if (!raw.trim()) throw new Error('The model returned an empty response.');

    const result = safeParseJSON<T>(raw);
    await log('completed');
    return { result, agent, durationMs: Date.now() - startedAt };
  } catch (err: any) {
    const message = err?.message || String(err);
    await log('failed', message);
    throw new AgentRunError(agentKey, `${agent.name} failed: ${message}`);
  }
};
