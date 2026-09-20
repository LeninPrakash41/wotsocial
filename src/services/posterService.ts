/**
 * Batch poster generation.
 *
 * A run spreads the requested count across the chosen templates, asks the
 * Poster Art Director agent for each template's share in one call, and saves
 * results as they arrive — so a failure at poster 40 does not lose the first
 * 39. Progress is reported per chunk rather than only at the end.
 */
import { Brand } from '../dbAdapter';
import { runAgent, AgentRunError } from './agentRuntime';
import { contentApi, PosterTemplate } from './studioApi';

/** Asking for too many in one call degrades quality and risks a truncated response. */
const CHUNK_SIZE = 5;

export interface PosterDraft {
  templateKey: string;
  headline: string;
  subhead?: string;
  body?: string;
  callToAction?: string;
  caption?: string;
  hashtags?: string[];
  imagePrompt?: string;
  paletteNotes?: string;
  contentPillar?: string;
  product?: any;
}

export interface BatchProgress {
  generated: number;
  requested: number;
  failed: number;
  currentTemplate?: string;
  message?: string;
}

export interface BatchOptions {
  brand: Brand;
  templates: PosterTemplate[];
  count: number;
  name?: string;
  extraContext?: string;
  /** Shopify products; when present the product promo agent is used instead. */
  products?: any[];
  offer?: string;
  onProgress?: (progress: BatchProgress) => void;
  signal?: AbortSignal;
}

/** Splits the requested total evenly, giving the remainder to the first templates. */
export const planBatch = (templates: PosterTemplate[], count: number): { template: PosterTemplate; count: number }[] => {
  if (!templates.length || count < 1) return [];
  const base = Math.floor(count / templates.length);
  const remainder = count % templates.length;
  return templates
    .map((template, i) => ({ template, count: base + (i < remainder ? 1 : 0) }))
    .filter(p => p.count > 0);
};

const brandVars = (brand: Brand) => {
  const research = (brand.agentResearchData || {}) as any;
  const palette = [brand.primaryColor, brand.secondaryColor, brand.accentColor, ...(brand.brandColors || [])]
    .filter(Boolean)
    .join(', ');

  return {
    brandName: brand.name,
    industry: brand.industry || '',
    category: brand.category || '',
    brandVoice: research?.siteAnalysis?.brandVoice || brand.brandTone || '',
    guidelines: (brand.guidelinesText || '').slice(0, 1200),
    palette: palette || 'Use the brand’s existing colours; do not invent a new palette.',
    primaryICP: research?.audienceProfile?.primaryICP || '',
    contentPillars: (research?.marketingStrategy?.contentPillars || [])
      .map((p: any) => p.title)
      .filter(Boolean)
      .join(', ')
  };
};

/**
 * Runs a batch end to end. Returns what was produced even when some chunks
 * failed, because partial output is still worth keeping.
 */
export const generatePosterBatch = async (
  options: BatchOptions
): Promise<{ batchId: string; posters: PosterDraft[]; failed: number; errors: string[] }> => {
  const { brand, templates, count, onProgress, signal } = options;

  if (!templates.length) throw new Error('Choose at least one template.');
  if (count < 1) throw new Error('Ask for at least one poster.');

  const usingProducts = Boolean(options.products?.length);
  const plan = planBatch(templates, count);

  const { batchId } = await contentApi.openBatch({
    brandId: brand.id,
    name: options.name || `${brand.name} — ${count} posters`,
    templates: templates.map(t => t.key),
    requested: count,
    source: usingProducts ? 'shopify' : 'brand'
  });

  const base = brandVars(brand);
  const collected: PosterDraft[] = [];
  const errors: string[] = [];
  let failed = 0;

  const report = (message?: string, currentTemplate?: string) =>
    onProgress?.({ generated: collected.length, requested: count, failed, currentTemplate, message });

  report('Starting…');

  for (const step of plan) {
    if (signal?.aborted) {
      await contentApi.completeBatch(batchId, { status: 'CANCELLED', failed });
      return { batchId, posters: collected, failed, errors };
    }

    // Long runs are chunked so a single oversized response cannot truncate.
    let remaining = step.count;
    while (remaining > 0) {
      const chunk = Math.min(CHUNK_SIZE, remaining);
      report(`Writing ${chunk} ${step.template.name} poster${chunk === 1 ? '' : 's'}…`, step.template.key);

      try {
        let drafts: PosterDraft[];

        if (usingProducts) {
          // One promo per product, drawn from the slice this chunk covers.
          const slice = (options.products || []).slice(collected.length, collected.length + chunk);
          if (!slice.length) { remaining = 0; break; }

          const { result } = await runAgent<any[]>('product_promo', {
            ...base,
            offer: options.offer || '',
            extraContext: options.extraContext || '',
            products: slice
              .map(p => `- id:${p.id} | ${p.title} | ${p.price || 'price not supplied'} | ${p.url} | ${p.description || ''}`)
              .join('\n')
          }, { brandId: brand.id, logRun: false });

          drafts = (Array.isArray(result) ? result : []).map((r: any) => {
            const product = slice.find(p => String(p.id) === String(r.productId)) || slice[0];
            return {
              templateKey: step.template.key,
              headline: r.headline || product?.title || '',
              subhead: r.subhead || '',
              body: r.price || product?.price || '',
              callToAction: r.callToAction || 'Shop now',
              caption: r.caption || '',
              hashtags: r.hashtags || [],
              imagePrompt: r.imagePrompt || '',
              contentPillar: 'Product',
              product: product ? { id: product.id, title: product.title, url: product.url, imageUrl: product.imageUrl } : null
            };
          });
        } else {
          const { result } = await runAgent<any[]>('poster_designer', {
            ...base,
            count: chunk,
            templateName: step.template.name,
            templateBrief: step.template.brief,
            templateConstraints: `${step.template.constraints}\nComposition: ${step.template.artDirection}\nAspect ratio: ${step.template.ratio}`,
            extraContext: options.extraContext || ''
          }, { brandId: brand.id, logRun: false });

          drafts = (Array.isArray(result) ? result : [result]).map((r: any) => ({
            templateKey: step.template.key,
            headline: r.headline || '',
            subhead: r.subhead || '',
            body: r.body || '',
            callToAction: r.callToAction || '',
            caption: r.caption || '',
            hashtags: r.hashtags || [],
            imagePrompt: r.imagePrompt || '',
            paletteNotes: r.paletteNotes || '',
            contentPillar: r.contentPillar || ''
          }));
        }

        const usable = drafts.filter(d => d.headline || d.caption);
        if (usable.length) {
          await contentApi.savePosters(batchId, brand.id, usable);
          collected.push(...usable);
        }
        if (usable.length < chunk) failed += chunk - usable.length;
      } catch (err) {
        failed += chunk;
        const message = err instanceof AgentRunError ? err.message : (err as Error).message;
        errors.push(`${step.template.name}: ${message}`);

        // An auth failure will hit every remaining chunk — stop rather than
        // burn through the rest of the batch producing the same error.
        if (/API key|401|invalid/i.test(message)) {
          await contentApi.completeBatch(batchId, { status: 'FAILED', failed, error: message });
          report('Stopped — the AI provider rejected the request.');
          return { batchId, posters: collected, failed, errors };
        }
      }

      remaining -= chunk;
      report();
    }
  }

  await contentApi.completeBatch(batchId, {
    status: collected.length ? 'COMPLETED' : 'FAILED',
    failed,
    error: errors.slice(0, 3).join(' | ')
  });

  report(collected.length ? 'Done.' : 'No posters were produced.');
  return { batchId, posters: collected, failed, errors };
};
