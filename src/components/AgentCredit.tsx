/**
 * Shows which agent produces the output on a page, which version of it is
 * live, and what brand context it is being given.
 *
 * Two reasons this is on screen rather than buried: it makes "is this written
 * by the agent?" answerable without reading code, and it makes the link
 * between an edit in Agent Studio and the output here obvious — you can see
 * the version number change after publishing.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Pencil, AlertTriangle } from 'lucide-react';
import { agentsApi, Agent } from '../services/studioApi';
import { Brand } from '../dbAdapter';

export function AgentCredit({ agentKey, brand }: { agentKey: string; brand?: Brand | null }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    agentsApi.published(agentKey)
      .then(res => { if (!cancelled) { setAgent(res.agent); setError(null); } })
      .catch(err => { if (!cancelled) setError(err?.message || 'Not published'); });
    return () => { cancelled = true; };
  }, [agentKey]);

  const research = (brand?.agentResearchData || {}) as any;
  const voice = research?.siteAnalysis?.brandVoice || brand?.brandTone;
  const hasStrategy = Boolean(research?.siteAnalysis);

  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <p className="text-[11px] leading-relaxed text-warn">
          This agent has no published version, so nothing here will run.{' '}
          <Link to="/agents" className="font-bold underline">Publish it in Agent Studio.</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-sunk px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-[11px] font-bold text-ink">
            Written by {agent ? agent.name : '…'}
            {agent && (
              <span className="ml-1.5 font-semibold text-ink-4">
                {agent.model} · v{agent.publishedVersion}
              </span>
            )}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {brand
              ? hasStrategy
                ? `Writing as ${brand.name} — ${voice}`
                : `Writing as ${brand.name}. Its voice has not been learned yet, so the output will be generic.`
              : 'No brand selected.'}
          </p>
        </div>
      </div>

      <Link
        to="/agents"
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-accent hover:text-accent-hover"
      >
        <Pencil className="h-3 w-3" />
        Edit this agent
      </Link>
    </div>
  );
}
