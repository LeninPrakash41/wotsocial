/**
 * Agent registry UI.
 *
 * Every agent is editable — prompt, model, temperature, output shape and
 * capabilities. Edits save as a draft and change nothing until they are
 * published, so an agent can be safely rewritten while a pipeline might run.
 * Published versions are kept, so any change can be rolled back.
 */
import React, { useEffect, useState } from 'react';
import {
  Bot, Layers, Target, Users, Compass, PenTool, Megaphone, Image as ImageIcon,
  FileText, ShoppingBag, Recycle, Save, UploadCloud, History, RotateCcw,
  Archive, Plus, ChevronRight, Sparkles, AlertTriangle, Copy
} from 'lucide-react';
import { agentsApi, Agent, CapabilityInfo } from '../services/studioApi';
import { clearAgentCache } from '../services/agentRuntime';
import { describeError } from '../services/integrationsApi';
import {
  Card, CardHeader, Button, Banner, Badge, Field, Input, Textarea, Select,
  SectionLabel, EmptyState, LoadingPage, BannerKind
} from './ui';
import { cn } from '../lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Layers, Target, Users, Compass, PenTool, Megaphone, Image: ImageIcon,
  FileText, ShoppingBag, Recycle, Bot, Sparkles
};

const MODEL_OPTIONS: Record<string, string[]> = {
  gemini: ['gemini-3-flash', 'gemini-3-flash-preview', 'gemini-3-pro', 'gemini-3.1-pro-preview'],
  claude: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5']
};

const emptyDraft = (): Partial<Agent> => ({
  name: '',
  role: '',
  description: '',
  icon: 'Bot',
  provider: 'gemini',
  model: 'gemini-3-flash',
  temperature: 0.7,
  systemPrompt: '',
  userPromptTemplate: '',
  outputSchema: '{\n  "result": "what the agent should return"\n}',
  capabilities: ['brand_context'],
  inputs: [],
  pipelineStage: null
});

export function AgentManager({ brandId }: { brandId?: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityInfo>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Agent> | null>(null);
  const [versions, setVersions] = useState<{ version: number; notes: string; publishedAt: string }[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string } | null>(null);

  const selected = agents.find(a => a.id === selectedId) || null;

  const load = async (keepSelection = true) => {
    setLoading(true);
    try {
      const res = await agentsApi.list();
      setAgents(res.agents);
      setCapabilities(res.capabilities);
      if (!keepSelection || !res.agents.some(a => a.id === selectedId)) {
        setSelectedId(res.agents[0]?.id || null);
      }
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, []);

  useEffect(() => {
    if (!selectedId) { setDraft(null); return; }
    setCreating(false);
    setShowVersions(false);
    agentsApi.detail(selectedId)
      .then(res => {
        setDraft({ ...res.agent });
        setVersions(res.versions);
        setRuns(res.runs);
      })
      .catch(err => setBanner({ kind: 'error', message: describeError(err) }));
  }, [selectedId]);

  const patch = (fields: Partial<Agent>) => setDraft(prev => ({ ...(prev || {}), ...fields }));

  const toggleCapability = (key: string) => {
    const current = draft?.capabilities || [];
    patch({ capabilities: current.includes(key) ? current.filter(c => c !== key) : [...current, key] });
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    setBusy(true);
    setBanner(null);
    try {
      if (creating) {
        const res = await agentsApi.create(draft);
        await load(false);
        setSelectedId(res.agent.id);
        setBanner({ kind: 'success', message: `"${res.agent.name}" created as a draft. Publish it to make it runnable.` });
      } else if (selected) {
        const res = await agentsApi.saveDraft(selected.id, draft);
        setAgents(prev => prev.map(a => a.id === res.agent.id ? res.agent : a));
        setDraft(res.agent);
        setBanner({
          kind: 'info',
          message: `Draft saved as version ${res.agent.version}. Runs still use version ${res.agent.publishedVersion ?? '—'} until you publish.`
        });
      }
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!selected || !draft) return;
    setBusy(true);
    setBanner(null);
    try {
      // Save whatever is on screen first, so publish never ships stale text.
      const saved = await agentsApi.saveDraft(selected.id, draft);
      const res = await agentsApi.publish(saved.agent.id);
      clearAgentCache();
      setAgents(prev => prev.map(a => a.id === res.agent.id ? res.agent : a));
      setDraft(res.agent);
      const detail = await agentsApi.detail(res.agent.id);
      setVersions(detail.versions);
      setBanner({ kind: 'success', message: res.message });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = async (version: number) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await agentsApi.revert(selected.id, version);
      setDraft(res.agent);
      setAgents(prev => prev.map(a => a.id === res.agent.id ? res.agent : a));
      setBanner({ kind: 'info', message: res.message });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    if (!window.confirm(`Restore the shipped defaults for "${selected.name}"? It saves as a draft — nothing changes until you publish.`)) return;
    setBusy(true);
    try {
      const res = await agentsApi.reset(selected.id);
      setDraft(res.agent);
      setBanner({ kind: 'info', message: res.message });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!selected) return;
    if (!window.confirm(`Archive "${selected.name}"? It will stop running until you restore it.`)) return;
    setBusy(true);
    try {
      const res = await agentsApi.archive(selected.id);
      setBanner({ kind: 'info', message: res.message });
      await load(false);
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setVersions([]);
    setRuns([]);
    setBanner(null);
  };

  if (loading) return <LoadingPage label="Loading agents…" />;

  const isDirty = Boolean(
    draft && selected && (
      draft.systemPrompt !== selected.systemPrompt ||
      draft.userPromptTemplate !== selected.userPromptTemplate ||
      draft.outputSchema !== selected.outputSchema ||
      draft.model !== selected.model ||
      draft.provider !== selected.provider ||
      Number(draft.temperature) !== Number(selected.temperature) ||
      JSON.stringify(draft.capabilities) !== JSON.stringify(selected.capabilities) ||
      draft.name !== selected.name ||
      draft.role !== selected.role ||
      draft.description !== selected.description
    )
  );

  return (
    <div className="space-y-5">
      {banner && <Banner kind={banner.kind} message={banner.message} onDismiss={() => setBanner(null)} />}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Roster */}
        <div className="space-y-3 lg:col-span-4 xl:col-span-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Agents ({agents.length})</SectionLabel>
            <Button size="sm" variant="secondary" icon={Plus} onClick={startCreate}>New</Button>
          </div>

          <div className="scroll-slim max-h-[640px] space-y-1.5 overflow-y-auto pr-1">
            {agents.map(agent => {
              const Icon = ICONS[agent.icon] || Bot;
              const active = agent.id === selectedId;
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedId(agent.id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition-colors',
                    active
                      ? 'border-accent-line bg-accent-soft'
                      : 'border-line bg-surface hover:border-line-strong'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={cn(
                      'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg',
                      active ? 'bg-accent text-white' : 'bg-sunk text-ink-3'
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-ink">{agent.name}</span>
                        {agent.pipelineStage !== null && (
                          <span className="shrink-0 text-[10px] font-bold text-ink-4 tabular">
                            #{agent.pipelineStage}
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-snug text-ink-3">{agent.role}</p>
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {agent.hasUnpublishedChanges
                          ? <Badge tone="warn">Draft v{agent.version}</Badge>
                          : agent.publishedVersion === null
                            ? <Badge tone="neutral">Unpublished</Badge>
                            : <Badge tone="ok">Live v{agent.publishedVersion}</Badge>}
                        {!agent.isBuiltin && <Badge tone="accent">Custom</Badge>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="space-y-5 lg:col-span-8 xl:col-span-9">
          {!draft ? (
            <Card>
              <EmptyState
                icon={Bot}
                title="Select an agent to edit"
                description="Change what an agent knows, how it writes and which model it runs on. Edits save as a draft until you publish."
              />
            </Card>
          ) : (
            <>
              <Card className="space-y-5">
                <CardHeader
                  icon={ICONS[draft.icon || 'Bot'] || Bot}
                  title={creating ? 'New agent' : draft.name || 'Agent'}
                  description={
                    creating
                      ? 'Define what it does, how it should write, and the shape of what it returns.'
                      : selected?.hasUnpublishedChanges
                        ? `Runs currently use version ${selected.publishedVersion}. Your draft is version ${selected.version}.`
                        : selected?.publishedVersion
                          ? `Version ${selected.publishedVersion} is live.`
                          : 'This agent has never been published, so nothing runs it yet.'
                  }
                  actions={
                    !creating && selected ? (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" icon={History} onClick={() => setShowVersions(v => !v)}>
                          {versions.length} version{versions.length === 1 ? '' : 's'}
                        </Button>
                        <Button size="sm" variant="secondary" icon={Save} loading={busy} onClick={handleSaveDraft}>
                          Save draft
                        </Button>
                        <Button
                          size="sm"
                          variant="accent"
                          icon={UploadCloud}
                          loading={busy}
                          onClick={handlePublish}
                          disabled={!isDirty && !selected.hasUnpublishedChanges}
                        >
                          Publish
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="accent" icon={Save} loading={busy} onClick={handleSaveDraft}>
                        Create agent
                      </Button>
                    )
                  }
                />

                {showVersions && versions.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-line bg-sunk p-4">
                    <SectionLabel>Published history</SectionLabel>
                    {versions.map(v => (
                      <div key={v.version} className="flex items-center justify-between gap-3 border-b border-line py-1.5 last:border-0">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-ink tabular">Version {v.version}</span>
                          {v.notes && <span className="ml-2 text-[11px] text-ink-3">{v.notes}</span>}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-[11px] text-ink-4">
                            {new Date(v.publishedAt).toLocaleString()}
                          </span>
                          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => handleRevert(v.version)}>
                            Restore
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" required>
                    <Input value={draft.name || ''} onChange={e => patch({ name: e.target.value })} />
                  </Field>
                  <Field label="What it does" hint="One line, shown in the roster.">
                    <Input value={draft.role || ''} onChange={e => patch({ role: e.target.value })} />
                  </Field>
                </div>

                <Field label="Description">
                  <Textarea rows={2} value={draft.description || ''} onChange={e => patch({ description: e.target.value })} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Provider">
                    <Select
                      value={draft.provider}
                      onChange={e => {
                        const provider = e.target.value as 'gemini' | 'claude';
                        patch({
                          provider,
                          model: MODEL_OPTIONS[provider][0],
                          // Search grounding is Gemini-only; drop it on switch.
                          capabilities: provider === 'claude'
                            ? (draft.capabilities || []).filter(c => c !== 'web_search')
                            : draft.capabilities
                        });
                      }}
                    >
                      <option value="gemini">Gemini</option>
                      <option value="claude">Claude</option>
                    </Select>
                  </Field>

                  <Field label="Model">
                    <Select value={draft.model} onChange={e => patch({ model: e.target.value })}>
                      {(MODEL_OPTIONS[draft.provider || 'gemini'] || []).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    label="Temperature"
                    hint={
                      Number(draft.temperature) <= 0.4 ? 'Consistent and literal.'
                        : Number(draft.temperature) >= 0.9 ? 'Inventive, less predictable.'
                        : 'Balanced.'
                    }
                  >
                    <Input
                      type="number" step="0.05" min="0" max="2"
                      value={draft.temperature ?? 0.7}
                      onChange={e => patch({ temperature: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              </Card>

              <Card className="space-y-5">
                <CardHeader
                  icon={Sparkles}
                  title="Instructions"
                  description="The system prompt sets the agent's expertise and constraints. The task template is filled from the inputs below — use {{variable}} placeholders."
                />

                <Field label="System prompt" required>
                  <Textarea
                    rows={4}
                    className="font-mono text-[11px]"
                    value={draft.systemPrompt || ''}
                    onChange={e => patch({ systemPrompt: e.target.value })}
                  />
                </Field>

                <Field
                  label="Task template"
                  required
                  hint="Placeholders that have no value are removed along with their line, so the model is never handed an empty field to fill in."
                >
                  <Textarea
                    rows={10}
                    className="font-mono text-[11px]"
                    value={draft.userPromptTemplate || ''}
                    onChange={e => patch({ userPromptTemplate: e.target.value })}
                  />
                </Field>

                <Field
                  label="Output shape"
                  hint="Must be valid JSON. Sent to the model as the exact structure to return, and used to parse the reply."
                  action={
                    <button
                      onClick={() => navigator.clipboard.writeText(draft.outputSchema || '')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-ink"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  }
                >
                  <Textarea
                    rows={8}
                    className="font-mono text-[11px]"
                    value={draft.outputSchema || ''}
                    onChange={e => patch({ outputSchema: e.target.value })}
                  />
                </Field>
              </Card>

              <Card className="space-y-4">
                <CardHeader
                  icon={Layers}
                  title="Capabilities"
                  description="What this agent is given and what it is allowed to do."
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.entries(capabilities) as [string, CapabilityInfo][]).map(([key, info]) => {
                    const on = (draft.capabilities || []).includes(key);
                    const blocked = key === 'web_search' && draft.provider === 'claude';
                    return (
                      <button
                        key={key}
                        disabled={blocked}
                        onClick={() => toggleCapability(key)}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                          on ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('text-xs font-bold', on ? 'text-accent-ink' : 'text-ink')}>
                            {info.label}
                          </span>
                          <span className={cn(
                            'h-3.5 w-3.5 shrink-0 rounded-full border-2',
                            on ? 'border-accent bg-accent' : 'border-line-strong'
                          )} />
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-ink-3">
                          {blocked ? 'Only available on Gemini.' : info.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </Card>

              {!creating && selected && (
                <Card className="space-y-4">
                  <CardHeader
                    icon={History}
                    title="Recent runs"
                    description="The last twenty executions of this agent."
                    actions={
                      <div className="flex items-center gap-2">
                        {selected.isBuiltin && (
                          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={handleReset}>
                            Reset to default
                          </Button>
                        )}
                        <Button size="sm" variant="danger" icon={Archive} onClick={handleArchive}>
                          Archive
                        </Button>
                      </div>
                    }
                  />
                  {runs.length === 0 ? (
                    <p className="py-4 text-center text-xs text-ink-4">This agent has not run yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {runs.slice(0, 8).map(run => (
                        <div key={run.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-[11px] last:border-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge tone={run.status === 'completed' ? 'ok' : 'danger'}>{run.status}</Badge>
                            <span className="text-ink-4 tabular">v{run.version}</span>
                            {run.error && <span className="truncate text-danger">{run.error}</span>}
                          </div>
                          <span className="shrink-0 text-ink-4 tabular">
                            {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s · ` : ''}
                            {new Date(run.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
