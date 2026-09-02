/**
 * Agent registry.
 *
 * Agents used to be hardcoded functions with their prompts inlined, so the
 * only way to change one was to edit the source. They are now rows: a customer
 * can change any prompt, model, output schema or capability, save it as a
 * draft, and publish when they are happy. Runs always use the published
 * version, and every published version is kept so a change can be rolled back.
 */
import { Router, Request, Response } from 'express';
import {
  q, saveRow, selectRows, ensureStoreReady, parseJson, stringifyJson, timestamp, num
} from './store';
import { asyncHandler, badRequest, notFound, requireParam, currentUserId, HttpError } from './http';
import { randomId } from './crypto';
import { BUILTIN_AGENTS, CAPABILITY_LABELS, AgentDefinition } from './agentCatalog';

const router = Router();

export interface StoredAgent {
  id: string;
  userId: string;
  brandId: string | null;
  key: string;
  name: string;
  role: string;
  description: string;
  icon: string;
  provider: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: string;
  capabilities: string[];
  inputs: any[];
  pipelineStage: number | null;
  sortOrder: number;
  status: 'draft' | 'published';
  version: number;
  publishedVersion: number | null;
  isBuiltin: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** True when the draft differs from what is currently live. */
  hasUnpublishedChanges: boolean;
}

const rowToAgent = (row: any): StoredAgent => {
  const version = num(row.version, 1);
  const publishedVersion = row.published_version ? num(row.published_version) : null;
  return {
    id: row.id,
    userId: row.user_id,
    brandId: row.brand_id || null,
    key: row.agent_key,
    name: row.name || '',
    role: row.role || '',
    description: row.description || '',
    icon: row.icon || 'Bot',
    provider: row.provider || 'gemini',
    model: row.model || 'gemini-3-flash',
    temperature: Number(row.temperature ?? 0.7),
    systemPrompt: row.system_prompt || '',
    userPromptTemplate: row.user_prompt_template || '',
    outputSchema: row.output_schema || '',
    capabilities: parseJson<string[]>(row.capabilities, []),
    inputs: parseJson<any[]>(row.inputs, []),
    pipelineStage: row.pipeline_stage ? num(row.pipeline_stage) : null,
    sortOrder: num(row.sort_order, 999),
    status: (row.status || 'published') as 'draft' | 'published',
    version,
    publishedVersion,
    isBuiltin: row.is_builtin === '1',
    archived: row.archived === '1',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasUnpublishedChanges: publishedVersion !== null && version > publishedVersion
  };
};

const agentRow = (userId: string, def: Partial<AgentDefinition> & { key: string }, extra: Record<string, any> = {}) => ({
  user_id: userId,
  agent_key: def.key,
  name: def.name ?? '',
  role: def.role ?? '',
  description: def.description ?? '',
  icon: def.icon ?? 'Bot',
  provider: def.provider ?? 'gemini',
  model: def.model ?? 'gemini-3-flash',
  temperature: String(def.temperature ?? 0.7),
  system_prompt: def.systemPrompt ?? '',
  user_prompt_template: def.userPromptTemplate ?? '',
  output_schema: def.outputSchema ?? '',
  capabilities: stringifyJson(def.capabilities ?? []),
  inputs: stringifyJson(def.inputs ?? []),
  pipeline_stage: def.pipelineStage != null ? String(def.pipelineStage) : '',
  sort_order: String(def.sortOrder ?? 999),
  ...extra
});

/**
 * Seeds the built-in catalogue once per workspace.
 *
 * Existing rows are never overwritten — a customer's edits to a built-in agent
 * survive restarts and upgrades. New built-ins added in a later release are
 * inserted on the next boot.
 */
export const ensureAgentsSeeded = async (userId: string): Promise<void> => {
  await ensureStoreReady();
  const existing = await q<any>('SELECT agent_key FROM agents WHERE user_id = $1', [userId]);
  const have = new Set(existing.map(r => r.agent_key));

  for (const def of BUILTIN_AGENTS) {
    if (have.has(def.key)) continue;
    const id = randomId('agent');
    const ts = timestamp();
    await saveRow('agents', {
      id,
      ...agentRow(userId, def, {
        brand_id: '',
        status: 'published',
        version: '1',
        published_version: '1',
        is_builtin: '1',
        archived: '0',
        created_at: ts,
        updated_at: ts
      })
    });
    await saveRow('agent_versions', {
      id: randomId('agentver'),
      agent_id: id,
      version: '1',
      snapshot: stringifyJson(def),
      notes: 'Built-in default',
      published_at: ts
    });
  }
};

const loadAgent = async (userId: string, id: string): Promise<StoredAgent> => {
  const rows = await selectRows<any>('agents', 'id = $1 AND user_id = $2', [id, userId]);
  if (!rows.length) throw notFound('That agent does not exist in this workspace.');
  return rowToAgent(rows[0]);
};

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  await ensureAgentsSeeded(userId);

  const includeArchived = req.query.includeArchived === 'true';
  const rows = await selectRows<any>('agents', 'user_id = $1', [userId]);
  const agents = rows
    .map(rowToAgent)
    .filter(a => includeArchived || !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  res.json({
    agents,
    capabilities: CAPABILITY_LABELS,
    pipeline: agents.filter(a => a.pipelineStage !== null).sort((a, b) => (a.pipelineStage! - b.pipelineStage!))
  });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const agent = await loadAgent(userId, req.params.id);
  const versions = await selectRows<any>(
    'agent_versions', 'agent_id = $1', [agent.id], 'ORDER BY published_at DESC'
  );
  const runs = await selectRows<any>(
    'agent_runs', 'agent_id = $1', [agent.id], 'ORDER BY created_at DESC LIMIT 20'
  );

  res.json({
    agent,
    versions: versions.map(v => ({
      id: v.id, version: num(v.version), notes: v.notes, publishedAt: v.published_at
    })),
    runs: runs.map(r => ({
      id: r.id, status: r.status, version: num(r.version),
      error: r.error, durationMs: num(r.duration_ms), createdAt: r.created_at
    }))
  });
}));

/** The definition the pipeline executes: always the published one. */
export const getPublishedAgent = async (userId: string, key: string): Promise<StoredAgent | null> => {
  await ensureAgentsSeeded(userId);
  const rows = await selectRows<any>(
    'agents', 'user_id = $1 AND agent_key = $2 AND archived = $3', [userId, key, '0']
  );
  if (!rows.length) return null;
  const agent = rowToAgent(rows[0]);
  if (agent.publishedVersion === null) return null;

  // A draft edit must not change behaviour until it is published, so run from
  // the published snapshot rather than the current row.
  if (agent.hasUnpublishedChanges) {
    const versions = await selectRows<any>(
      'agent_versions', 'agent_id = $1 AND version = $2', [agent.id, String(agent.publishedVersion)]
    );
    if (versions.length) {
      const snapshot = parseJson<Partial<AgentDefinition>>(versions[0].snapshot, {});
      return { ...agent, ...snapshot, key: agent.key, id: agent.id } as StoredAgent;
    }
  }
  return agent;
};

router.get('/published/:key', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const agent = await getPublishedAgent(userId, req.params.key);
  if (!agent) {
    throw new HttpError(409, `Agent "${req.params.key}" has no published version. Publish it before running it.`);
  }
  res.json({ agent });
}));

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

const VALID_PROVIDERS = new Set(['gemini', 'claude']);

const validate = (body: any) => {
  if (body.provider && !VALID_PROVIDERS.has(body.provider)) {
    throw badRequest('Provider must be either "gemini" or "claude".');
  }
  if (body.temperature != null) {
    const t = Number(body.temperature);
    if (!Number.isFinite(t) || t < 0 || t > 2) throw badRequest('Temperature must be between 0 and 2.');
  }
  if (body.outputSchema) {
    try {
      JSON.parse(body.outputSchema);
    } catch {
      throw badRequest('The output schema must be valid JSON — it is sent to the model as the required shape.');
    }
  }
  if (body.capabilities && !Array.isArray(body.capabilities)) {
    throw badRequest('Capabilities must be a list.');
  }
  if (body.provider === 'claude' && (body.capabilities || []).includes('web_search')) {
    throw badRequest('Live web search is only available on Gemini. Remove the capability or switch provider.');
  }
};

/** Creates a new custom agent. */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  await ensureAgentsSeeded(userId);
  validate(req.body);

  const name = requireParam(req.body.name, 'name');
  const key = String(req.body.key || name)
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    .slice(0, 48);

  const clash = await selectRows<any>('agents', 'user_id = $1 AND agent_key = $2', [userId, key]);
  if (clash.length) throw badRequest(`An agent with the key "${key}" already exists. Choose a different name.`);

  const id = randomId('agent');
  const ts = timestamp();
  await saveRow('agents', {
    id,
    ...agentRow(userId, { ...req.body, key, name }, {
      brand_id: req.body.brandId || '',
      // A new agent starts as a draft: nothing runs it until it is published.
      status: 'draft',
      version: '1',
      published_version: '',
      is_builtin: '0',
      archived: '0',
      created_at: ts,
      updated_at: ts
    })
  });

  res.json({ success: true, agent: await loadAgent(userId, id) });
}));

/**
 * Saves a draft. The live behaviour is unchanged until publish, which is what
 * makes it safe to edit an agent that a scheduled run might use at any moment.
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const existing = await loadAgent(userId, req.params.id);
  validate(req.body);

  const nextVersion = existing.publishedVersion === null
    ? existing.version
    : Math.max(existing.version, existing.publishedVersion) + (existing.hasUnpublishedChanges ? 0 : 1);

  await saveRow('agents', {
    id: existing.id,
    ...agentRow(userId, {
      key: existing.key,
      name: req.body.name ?? existing.name,
      role: req.body.role ?? existing.role,
      description: req.body.description ?? existing.description,
      icon: req.body.icon ?? existing.icon,
      provider: req.body.provider ?? existing.provider,
      model: req.body.model ?? existing.model,
      temperature: req.body.temperature ?? existing.temperature,
      systemPrompt: req.body.systemPrompt ?? existing.systemPrompt,
      userPromptTemplate: req.body.userPromptTemplate ?? existing.userPromptTemplate,
      outputSchema: req.body.outputSchema ?? existing.outputSchema,
      capabilities: req.body.capabilities ?? existing.capabilities,
      inputs: req.body.inputs ?? existing.inputs,
      pipelineStage: req.body.pipelineStage !== undefined ? req.body.pipelineStage : existing.pipelineStage,
      sortOrder: req.body.sortOrder ?? existing.sortOrder
    } as any, {
      brand_id: existing.brandId || '',
      status: 'draft',
      version: String(nextVersion),
      published_version: existing.publishedVersion != null ? String(existing.publishedVersion) : '',
      is_builtin: existing.isBuiltin ? '1' : '0',
      archived: existing.archived ? '1' : '0',
      created_at: existing.createdAt,
      updated_at: timestamp()
    })
  });

  res.json({ success: true, agent: await loadAgent(userId, existing.id) });
}));

/** Publishes the current draft and snapshots it so it can be rolled back to. */
router.post('/:id/publish', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const agent = await loadAgent(userId, req.params.id);

  if (agent.status === 'published' && !agent.hasUnpublishedChanges) {
    return res.json({
      success: true, agent, alreadyLive: true,
      message: 'This agent is already live and has no unpublished changes.'
    });
  }

  const ts = timestamp();
  await saveRow('agent_versions', {
    id: randomId('agentver'),
    agent_id: agent.id,
    version: String(agent.version),
    snapshot: stringifyJson({
      name: agent.name, role: agent.role, description: agent.description, icon: agent.icon,
      provider: agent.provider, model: agent.model, temperature: agent.temperature,
      systemPrompt: agent.systemPrompt, userPromptTemplate: agent.userPromptTemplate,
      outputSchema: agent.outputSchema, capabilities: agent.capabilities,
      inputs: agent.inputs, pipelineStage: agent.pipelineStage, sortOrder: agent.sortOrder
    }),
    notes: req.body.notes || '',
    published_at: ts
  });

  await q(
    `UPDATE agents SET status = 'published', published_version = $1, updated_at = $2 WHERE id = $3`,
    [String(agent.version), ts, agent.id]
  );

  res.json({
    success: true,
    agent: await loadAgent(userId, agent.id),
    message: `Version ${agent.version} is live. Runs from now on use these settings.`
  });
}));

/** Restores a previous version as the current draft, ready to publish. */
router.post('/:id/revert', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const agent = await loadAgent(userId, req.params.id);
  const version = requireParam(req.body.version, 'version');

  const rows = await selectRows<any>(
    'agent_versions', 'agent_id = $1 AND version = $2', [agent.id, String(version)]
  );
  if (!rows.length) throw notFound(`Version ${version} of this agent was not found.`);

  const snapshot = parseJson<Partial<AgentDefinition>>(rows[0].snapshot, {});
  const nextVersion = Math.max(agent.version, agent.publishedVersion ?? 0) + 1;

  await saveRow('agents', {
    id: agent.id,
    ...agentRow(userId, { ...snapshot, key: agent.key } as any, {
      brand_id: agent.brandId || '',
      status: 'draft',
      version: String(nextVersion),
      published_version: agent.publishedVersion != null ? String(agent.publishedVersion) : '',
      is_builtin: agent.isBuiltin ? '1' : '0',
      archived: '0',
      created_at: agent.createdAt,
      updated_at: timestamp()
    })
  });

  res.json({
    success: true,
    agent: await loadAgent(userId, agent.id),
    message: `Version ${version} restored as a draft. Publish it to make it live.`
  });
}));

/** Resets a built-in back to the definition it shipped with. */
router.post('/:id/reset', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const agent = await loadAgent(userId, req.params.id);
  if (!agent.isBuiltin) throw badRequest('Only built-in agents can be reset. Custom agents can be reverted to an earlier version instead.');

  const def = BUILTIN_AGENTS.find(a => a.key === agent.key);
  if (!def) throw notFound('This agent no longer has a built-in default to reset to.');

  const nextVersion = Math.max(agent.version, agent.publishedVersion ?? 0) + 1;
  await saveRow('agents', {
    id: agent.id,
    ...agentRow(userId, def, {
      brand_id: agent.brandId || '',
      status: 'draft',
      version: String(nextVersion),
      published_version: agent.publishedVersion != null ? String(agent.publishedVersion) : '',
      is_builtin: '1',
      archived: '0',
      created_at: agent.createdAt,
      updated_at: timestamp()
    })
  });

  res.json({
    success: true,
    agent: await loadAgent(userId, agent.id),
    message: 'Restored the shipped defaults as a draft. Publish to make them live.'
  });
}));

/**
 * Archiving rather than deleting: a built-in can be taken out of the way
 * without losing the version history a run may still reference.
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const agent = await loadAgent(userId, req.params.id);
  await q(`UPDATE agents SET archived = '1', updated_at = $1 WHERE id = $2`, [timestamp(), agent.id]);
  res.json({ success: true, message: `"${agent.name}" archived. It will not run until it is restored.` });
}));

router.post('/:id/restore', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const agent = await loadAgent(userId, req.params.id);
  await q(`UPDATE agents SET archived = '0', updated_at = $1 WHERE id = $2`, [timestamp(), agent.id]);
  res.json({ success: true, agent: await loadAgent(userId, agent.id) });
}));

/** Records an execution so the studio can show what each agent has been doing. */
router.post('/:id/runs', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const agent = await loadAgent(userId, req.params.id);
  await saveRow('agent_runs', {
    id: randomId('agentrun'),
    agent_id: agent.id,
    agent_key: agent.key,
    brand_id: req.body.brandId || '',
    version: String(agent.publishedVersion ?? agent.version),
    status: req.body.status === 'failed' ? 'failed' : 'completed',
    inputs: stringifyJson(req.body.inputs || {}),
    error: req.body.error ? String(req.body.error).slice(0, 500) : '',
    duration_ms: String(num(req.body.durationMs)),
    created_at: timestamp()
  });
  res.json({ success: true });
}));

export default router;
