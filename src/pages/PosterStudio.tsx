/**
 * Poster Studio.
 *
 * Pick templates, pick how many, and the Poster Art Director agent writes each
 * one against the brand's guidelines. Batches save as they go, so a failure
 * partway through keeps everything produced up to that point.
 */
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Image as ImageIcon, Sparkles, Layers, ShoppingBag, RefreshCw, Check,
  Download, Copy, LayoutGrid, Wand2, Store, AlertTriangle, Plus
} from 'lucide-react';
import { getBrands, getBrandById, Brand, addPost } from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import {
  PageHeader, TabNav, Card, CardHeader, Button, Banner, Badge, Field,
  Input, Textarea, SectionLabel, EmptyState, LoadingPage, MediaSlot, BannerKind
} from '../components/ui';
import { contentApi, PosterTemplate, Poster, PosterBatch } from '../services/studioApi';
import { generatePosterBatch, planBatch, BatchProgress } from '../services/posterService';
import { availableProviders } from '../services/agentRuntime';
import { generatePosterImage } from '../services/geminiService';
import { describeError } from '../services/integrationsApi';
import { cn } from '../lib/utils';

const RATIO_CLASS: Record<string, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  story: 'aspect-[9/16]',
  landscape: 'aspect-[1.91/1]'
};

export function PosterStudio() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'generate' | 'library' | 'batches'>('generate');

  const [templates, setTemplates] = useState<PosterTemplate[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [maxPerBatch, setMaxPerBatch] = useState(50);
  const [extraContext, setExtraContext] = useState('');

  const [source, setSource] = useState<'brand' | 'shopify'>('brand');
  const [products, setProducts] = useState<any[]>([]);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [offer, setOffer] = useState('');

  const [posters, setPosters] = useState<Poster[]>([]);
  const [batches, setBatches] = useState<PosterBatch[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string; detail?: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [rendering, setRendering] = useState<string | null>(null);

  const loadData = async (brandIdToLoad?: string) => {
    setLoading(true);
    try {
      const activeId = brandIdToLoad || localStorage.getItem('activeBrandId');
      let currentBrand: Brand | null = null;
      if (activeId) currentBrand = await getBrandById(activeId);
      if (!currentBrand) {
        const all = await getBrands();
        if (all.length) currentBrand = all[0];
      }
      if (!currentBrand) { setBrand(null); return; }

      setBrand(currentBrand);
      localStorage.setItem('activeBrandId', currentBrand.id);

      const tpl = await contentApi.posterTemplates(currentBrand.industry);
      setTemplates(tpl.templates);
      setMaxPerBatch(tpl.maxPerBatch);
      // Start with the three best-fitting templates for this industry.
      setSelectedKeys(prev => prev.length ? prev : tpl.templates.slice(0, 3).map(t => t.key));

      const [posterRes, batchRes] = await Promise.all([
        contentApi.posters(currentBrand.id),
        contentApi.batches(currentBrand.id)
      ]);
      setPosters(posterRes.posters);
      setBatches(batchRes.batches);

      contentApi.connections(currentBrand.id)
        .then(c => setShopifyConnected(Boolean(c.shopify)))
        .catch(() => setShopifyConnected(false));
    } catch (err) {
      setBanner({ kind: 'error', message: `Could not load the Poster Studio: ${describeError(err)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const onBrandChange = (e: any) => { if (e.detail) loadData(e.detail.id); };
    window.addEventListener('activeBrandChanged', onBrandChange);
    return () => window.removeEventListener('activeBrandChanged', onBrandChange);
  }, []);

  const loadProducts = async () => {
    if (!brand) return;
    setBanner(null);
    try {
      const res = await contentApi.shopifyProducts(brand.id, Math.min(50, count));
      setProducts(res.products);
      if (!res.products.length) {
        setBanner({ kind: 'warning', message: 'The connected store has no active products to promote.' });
      } else {
        setBanner({ kind: 'success', message: `Loaded ${res.products.length} product${res.products.length === 1 ? '' : 's'} from ${res.shop || 'Shopify'}.` });
      }
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  const toggleTemplate = (key: string) =>
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const handleGenerate = async () => {
    if (!brand) return;

    if (!availableProviders().length) {
      setBanner({
        kind: 'error',
        message: 'No AI key configured.',
        detail: 'Add a Gemini or Claude API key in Integrations before generating posters.'
      });
      return;
    }
    if (!selectedKeys.length) {
      setBanner({ kind: 'error', message: 'Choose at least one template.' });
      return;
    }
    if (source === 'shopify' && !products.length) {
      setBanner({ kind: 'error', message: 'Load products from Shopify first, or switch back to brand posters.' });
      return;
    }

    const chosen = templates.filter(t => selectedKeys.includes(t.key));
    setGenerating(true);
    setBanner(null);
    setProgress({ generated: 0, requested: count, failed: 0, message: 'Starting…' });
    abortRef.current = new AbortController();

    try {
      const res = await generatePosterBatch({
        brand,
        templates: chosen,
        count: source === 'shopify' ? Math.min(count, products.length) : count,
        extraContext,
        products: source === 'shopify' ? products : undefined,
        offer,
        onProgress: setProgress,
        signal: abortRef.current.signal
      });

      const refreshed = await contentApi.posters(brand.id);
      setPosters(refreshed.posters);
      setBatches((await contentApi.batches(brand.id)).batches);

      if (res.posters.length) {
        setBanner({
          kind: res.failed ? 'warning' : 'success',
          message: `Generated ${res.posters.length} poster${res.posters.length === 1 ? '' : 's'}${res.failed ? `, ${res.failed} could not be produced` : ''}.`,
          detail: res.errors[0]
        });
        setActiveTab('library');
      } else {
        setBanner({ kind: 'error', message: 'No posters were produced.', detail: res.errors[0] });
      }
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setGenerating(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  /** Sends a poster's caption into the content calendar as a scheduled draft. */
  const handleSchedule = async (poster: Poster) => {
    if (!brand) return;
    try {
      await addPost({
        content: [poster.caption, (poster.hashtags || []).join(' ')].filter(Boolean).join('\n\n'),
        status: 'suggested',
        mediaUrl: poster.imageUrl || poster.product?.imageUrl,
        mediaType: poster.imageUrl || poster.product?.imageUrl ? 'image' : 'none',
        platforms: ['instagram', 'facebook'],
        visualPrompt: poster.imagePrompt,
        isAgentGenerated: true
      } as any);
      await contentApi.updatePoster(poster.id, { status: 'scheduled' });
      setPosters(prev => prev.map(p => p.id === poster.id ? { ...p, status: 'scheduled' } : p));
      setBanner({ kind: 'success', message: 'Added to the content calendar as a draft.' });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  /**
   * Renders the artwork for one poster. Deliberately one at a time rather than
   * across the whole batch: image generation is the slow, expensive half, and
   * most posters get their copy revised before anyone wants the picture.
   */
  const handleRender = async (poster: Poster) => {
    const template = templates.find(t => t.key === poster.templateKey);
    setRendering(poster.id);
    setBanner(null);
    try {
      const imageUrl = await generatePosterImage({
        prompt: poster.imagePrompt,
        aspectRatio: template?.ratio === 'story' ? '9:16' : template?.ratio === 'portrait' ? '4:5' : '1:1'
      });
      await contentApi.updatePoster(poster.id, { imageUrl });
      setPosters(prev => prev.map(p => p.id === poster.id ? { ...p, imageUrl } : p));
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setRendering(null);
    }
  };

  const exportCsv = () => {
    const header = ['Template', 'Headline', 'Subhead', 'Body', 'CTA', 'Caption', 'Hashtags', 'Image prompt'];
    const escape = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const rows = posters.map(p => [
      p.templateKey, p.headline, p.subhead, p.body, p.callToAction,
      p.caption, (p.hashtags || []).join(' '), p.imagePrompt
    ].map(escape).join(','));

    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${brand?.name || 'posters'}-posters.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingPage label="Loading Poster Studio…" />;

  const plan = planBatch(templates.filter(t => selectedKeys.includes(t.key)), count);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <PageHeader
        eyebrow="Brand-guided poster generation"
        title="Poster Studio"
        description="Choose the layouts you want, and the art director agent writes each poster against your brand guidelines — copy, call to action and full art direction for the image generator."
        actions={
          <>
            <BrandSelector
              activeBrandId={brand?.id}
              onBrandChange={(selected) => {
                setBrand(selected);
                localStorage.setItem('activeBrandId', selected.id);
                loadData(selected.id);
              }}
            />
            {posters.length > 0 && (
              <Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>
            )}
          </>
        }
      />

      {banner && (
        <Banner kind={banner.kind} message={banner.message} detail={banner.detail} onDismiss={() => setBanner(null)} />
      )}

      <TabNav
        tabs={[
          { id: 'generate', label: 'Generate', icon: Wand2 },
          { id: 'library', label: 'Posters', icon: LayoutGrid, count: posters.length },
          { id: 'batches', label: 'Runs', icon: Layers, count: batches.length }
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {activeTab === 'generate' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-8">
            <Card className="space-y-5">
              <CardHeader
                icon={Sparkles}
                title="What to make"
                description="Each template is a layout contract — it fixes which text slots exist and how many words each can hold, so a batch comes back varied in idea but consistent in shape."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How many posters" hint={`Up to ${maxPerBatch} per run.`}>
                  <Input
                    type="number" min={1} max={maxPerBatch}
                    value={count}
                    onChange={e => setCount(Math.max(1, Math.min(maxPerBatch, Number(e.target.value) || 1)))}
                  />
                </Field>

                <Field label="Source">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSource('brand')}
                      className={cn(
                        'flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors',
                        source === 'brand' ? 'border-accent-line bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-3'
                      )}
                    >
                      Brand guidelines
                    </button>
                    <button
                      onClick={() => setSource('shopify')}
                      className={cn(
                        'flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors',
                        source === 'shopify' ? 'border-accent-line bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-3'
                      )}
                    >
                      Shopify products
                    </button>
                  </div>
                </Field>
              </div>

              {source === 'shopify' && (
                <div className="space-y-3 rounded-xl border border-line bg-sunk p-4">
                  {!shopifyConnected ? (
                    <div className="flex items-start gap-2.5 text-xs text-ink-2">
                      <Store className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
                      <div className="space-y-2">
                        <p className="font-bold">No Shopify store connected.</p>
                        <Button size="sm" variant="secondary" onClick={() => navigate('/integrations')}>
                          Connect a store
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <SectionLabel>{products.length} product{products.length === 1 ? '' : 's'} loaded</SectionLabel>
                        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={loadProducts}>
                          Load products
                        </Button>
                      </div>
                      <Field label="Offer or angle" hint="Only offers you enter here are used — the agent will not invent a discount.">
                        <Input value={offer} onChange={e => setOffer(e.target.value)} placeholder="e.g. Summer sale, 20% off until 31 August" />
                      </Field>
                    </>
                  )}
                </div>
              )}

              <Field
                label="Anything else the agent should know"
                hint="Campaign context, a launch date, tone notes, things to avoid."
              >
                <Textarea
                  rows={3}
                  value={extraContext}
                  onChange={e => setExtraContext(e.target.value)}
                  placeholder="e.g. We are launching a self-serve tier in September. Avoid mentioning pricing."
                />
              </Field>
            </Card>

            <Card className="space-y-4">
              <CardHeader
                icon={Layers}
                title={`Templates (${selectedKeys.length} selected)`}
                description={brand?.industry ? `Ordered by fit for ${brand.industry}.` : undefined}
                actions={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedKeys(selectedKeys.length === templates.length ? [] : templates.map(t => t.key))}
                  >
                    {selectedKeys.length === templates.length ? 'Clear all' : 'Select all'}
                  </Button>
                }
              />

              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {templates.map(t => {
                  const on = selectedKeys.includes(t.key);
                  const share = plan.find(p => p.template.key === t.key)?.count || 0;
                  return (
                    <button
                      key={t.key}
                      onClick={() => toggleTemplate(t.key)}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-colors',
                        on ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn('text-xs font-bold', on ? 'text-accent-ink' : 'text-ink')}>{t.name}</span>
                        {on && share > 0 && <Badge tone="accent">{share}</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-3">{t.brief}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Badge tone="neutral">{t.ratio}</Badge>
                        <span className="text-[10px] font-semibold text-ink-4">{t.category}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Run panel */}
          <div className="lg:col-span-4">
            <Card className="space-y-4 lg:sticky lg:top-6">
              <CardHeader icon={Wand2} title="Run" />

              <div className="space-y-2 rounded-xl border border-line bg-sunk p-4">
                {plan.length === 0 ? (
                  <p className="text-xs text-ink-3">Select templates to see the split.</p>
                ) : (
                  plan.map(p => (
                    <div key={p.template.key} className="flex items-center justify-between text-[11px]">
                      <span className="truncate text-ink-2">{p.template.name}</span>
                      <span className="shrink-0 font-bold text-ink tabular">{p.count}</span>
                    </div>
                  ))
                )}
              </div>

              {progress && (
                <div className="space-y-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full accent-thread transition-all"
                      style={{ width: `${Math.round((progress.generated / Math.max(1, progress.requested)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-semibold text-ink-3">
                    {progress.generated} of {progress.requested}
                    {progress.failed > 0 && ` · ${progress.failed} failed`}
                    {progress.message ? ` · ${progress.message}` : ''}
                  </p>
                </div>
              )}

              <Button
                variant="accent"
                size="lg"
                className="w-full"
                icon={Sparkles}
                loading={generating}
                onClick={handleGenerate}
                disabled={generating || !selectedKeys.length}
              >
                {generating ? 'Writing posters…' : `Generate ${count} poster${count === 1 ? '' : 's'}`}
              </Button>

              {generating && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => abortRef.current?.abort()}>
                  Stop after this batch
                </Button>
              )}

              <p className="text-[11px] leading-relaxed text-ink-4">
                Posters are written, not rendered. Each one comes with an art-direction prompt you can run through the
                image generator or hand to a designer.
              </p>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'library' && (
        <Card padded={false}>
          {posters.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title="No posters yet"
              description="Generate a batch and everything produced lands here, ready to schedule or export."
              action={<Button variant="accent" onClick={() => setActiveTab('generate')}>Generate posters</Button>}
            />
          ) : (
            <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
              {posters.map(poster => {
                const template = templates.find(t => t.key === poster.templateKey);
                return (
                  <div key={poster.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                    <div className={cn('relative bg-sunk', RATIO_CLASS[template?.ratio || 'square'])}>
                      {(poster.imageUrl || poster.product?.imageUrl) ? (
                        <img
                          src={poster.imageUrl || poster.product.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col justify-between p-4">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-ink-4">
                            {template?.name || poster.templateKey}
                          </span>
                          <div className="space-y-1.5">
                            <p className="text-sm font-extrabold leading-tight text-ink">{poster.headline}</p>
                            {poster.subhead && <p className="text-[11px] leading-snug text-ink-2">{poster.subhead}</p>}
                            {poster.body && <p className="text-[10px] leading-snug text-ink-3">{poster.body}</p>}
                          </div>
                          {poster.callToAction && (
                            <span className="self-start rounded-md bg-ink px-2.5 py-1 text-[10px] font-bold text-white">
                              {poster.callToAction}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2.5 p-3.5">
                      <p className="line-clamp-3 text-[11px] leading-snug text-ink-2">{poster.caption}</p>
                      {poster.hashtags?.length > 0 && (
                        <p className="line-clamp-1 text-[10px] font-semibold text-accent">{poster.hashtags.join(' ')}</p>
                      )}
                      <div className="flex items-center gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant={poster.status === 'scheduled' ? 'secondary' : 'primary'}
                          icon={poster.status === 'scheduled' ? Check : Plus}
                          onClick={() => handleSchedule(poster)}
                          disabled={poster.status === 'scheduled'}
                        >
                          {poster.status === 'scheduled' ? 'In calendar' : 'Schedule'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Wand2}
                          loading={rendering === poster.id}
                          disabled={!poster.imagePrompt || rendering !== null}
                          onClick={() => handleRender(poster)}
                        >
                          {poster.imageUrl ? 'Redo art' : 'Render art'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Copy}
                          onClick={() => navigator.clipboard.writeText(poster.imagePrompt || '')}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'batches' && (
        <Card padded={false}>
          {batches.length === 0 ? (
            <EmptyState icon={Layers} title="No runs yet" description="Every generation run is recorded here with what it produced." />
          ) : (
            <div className="divide-y divide-line">
              {batches.map(b => (
                <div key={b.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-bold text-ink">{b.name}</p>
                    <p className="text-[11px] text-ink-3">
                      {b.templates.length} template{b.templates.length === 1 ? '' : 's'} ·{' '}
                      {new Date(b.createdAt).toLocaleString()}
                      {b.source === 'shopify' && ' · from Shopify'}
                    </p>
                    {b.error && <p className="text-[11px] text-danger">{b.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs font-bold text-ink tabular">
                      {b.generated}/{b.requested}
                    </span>
                    {b.failed > 0 && <Badge tone="warn">{b.failed} failed</Badge>}
                    <Badge tone={b.status === 'COMPLETED' ? 'ok' : b.status === 'RUNNING' ? 'accent' : 'danger'}>
                      {b.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
