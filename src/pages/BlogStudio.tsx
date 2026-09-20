/**
 * Blog Studio.
 *
 * Writes long-form articles with the blog writer agent and sends them to a
 * connected WordPress site. Articles go across as drafts unless publishing
 * live is explicitly chosen, so nothing appears on a customer's site without
 * a deliberate decision.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Sparkles, Globe, Send, ExternalLink, Eye, RefreshCw, Copy, Check
} from 'lucide-react';
import { getBrands, getBrandById, Brand } from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import {
  PageHeader, TabNav, Card, CardHeader, Button, Banner, Badge, Field,
  Input, Textarea, SectionLabel, EmptyState, LoadingPage, BannerKind
} from '../components/ui';
import { contentApi } from '../services/studioApi';
import { runAgent, availableProviders, AgentRunError } from '../services/agentRuntime';
import { describeError } from '../services/integrationsApi';
import { AgentCredit } from '../components/AgentCredit';

interface Article {
  title: string;
  slug: string;
  metaDescription: string;
  excerpt: string;
  bodyHtml: string;
  tags: string[];
  categories: string[];
  featuredImagePrompt: string;
  estimatedReadMinutes: number;
}

export function BlogStudio() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'write' | 'published'>('write');

  const [topic, setTopic] = useState('');
  const [keyword, setKeyword] = useState('');
  const [wordCount, setWordCount] = useState(1200);
  const [extraContext, setExtraContext] = useState('');

  const [article, setArticle] = useState<Article | null>(null);
  const [writing, setWriting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishLive, setPublishLive] = useState(false);
  const [copied, setCopied] = useState(false);

  const [wordpress, setWordpress] = useState<any>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string; detail?: string } | null>(null);

  const loadData = async (brandIdToLoad?: string) => {
    setLoading(true);
    try {
      const activeId = brandIdToLoad || localStorage.getItem('activeBrandId');
      let current: Brand | null = activeId ? await getBrandById(activeId) : null;
      if (!current) {
        const all = await getBrands();
        current = all[0] || null;
      }
      if (!current) { setBrand(null); return; }

      setBrand(current);
      localStorage.setItem('activeBrandId', current.id);

      const [conns, arts] = await Promise.all([
        contentApi.connections(current.id),
        contentApi.blogArticles(current.id)
      ]);
      setWordpress(conns.wordpress);
      setArticles(arts.articles);
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
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

  const handleWrite = async () => {
    if (!brand || !topic.trim()) return;

    if (!availableProviders().length) {
      setBanner({
        kind: 'error',
        message: 'No AI key configured.',
        detail: 'Add a Gemini or Claude API key in Integrations before writing an article.'
      });
      return;
    }

    setWriting(true);
    setBanner(null);
    setArticle(null);

    try {
      const research = (brand.agentResearchData || {}) as any;
      const { result } = await runAgent<Article>('blog_writer', {
        brandName: brand.name,
        industry: brand.industry,
        category: brand.category,
        brandVoice: research?.siteAnalysis?.brandVoice || brand.brandTone,
        guidelines: (brand.guidelinesText || '').slice(0, 1200),
        primaryICP: research?.audienceProfile?.primaryICP,
        painPoints: research?.audienceProfile?.painPoints,
        topic: topic.trim(),
        keyword: keyword.trim(),
        wordCount,
        extraContext: extraContext.trim()
      }, { brandId: brand.id });

      setArticle(result);
      setBanner({
        kind: 'success',
        message: `"${result.title}" drafted — about ${result.estimatedReadMinutes || Math.round(wordCount / 220)} minutes to read.`
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        message: err instanceof AgentRunError ? err.message : describeError(err)
      });
    } finally {
      setWriting(false);
    }
  };

  const handlePublish = async () => {
    if (!brand || !article) return;
    if (!wordpress) {
      setBanner({ kind: 'error', message: 'Connect a WordPress site in Integrations before publishing.' });
      return;
    }
    if (publishLive && !window.confirm(
      `This publishes "${article.title}" live on ${wordpress.siteUrl}, visible to anyone. Continue?`
    )) return;

    setPublishing(true);
    setBanner(null);
    try {
      const res = await contentApi.publishToWordPress({
        brandId: brand.id,
        title: article.title,
        bodyHtml: article.bodyHtml,
        excerpt: article.excerpt,
        slug: article.slug,
        metaDescription: article.metaDescription,
        tags: article.tags,
        categories: article.categories,
        featuredImagePrompt: article.featuredImagePrompt,
        publish: publishLive
      });

      setBanner({ kind: 'success', message: res.note });
      setArticles((await contentApi.blogArticles(brand.id)).articles);
      setTab('published');
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <LoadingPage label="Loading Blog Studio…" />;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <PageHeader
        eyebrow="Long-form content"
        title="Blog Studio"
        description="Writes full articles in your brand's voice, structured for search, and sends them to your WordPress site as drafts you can review before they go live."
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
            {wordpress ? (
              <span className="inline-flex items-center gap-2 rounded-xl border border-ok-line bg-ok-soft px-3 py-2 text-xs font-bold text-ok">
                <Globe className="h-3.5 w-3.5" />
                {new URL(wordpress.siteUrl).hostname}
              </span>
            ) : (
              <Button variant="secondary" icon={Globe} onClick={() => navigate('/integrations')}>
                Connect WordPress
              </Button>
            )}
          </>
        }
      />

      {banner && (
        <Banner kind={banner.kind} message={banner.message} detail={banner.detail} onDismiss={() => setBanner(null)} />
      )}

      <AgentCredit agentKey="blog_writer" brand={brand} />

      <TabNav
        tabs={[
          { id: 'write', label: 'Write', icon: Sparkles },
          { id: 'published', label: 'Sent to WordPress', icon: FileText, count: articles.length }
        ]}
        active={tab}
        onChange={(id) => setTab(id as any)}
      />

      {tab === 'write' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-5">
            <Card className="space-y-4">
              <CardHeader
                icon={Sparkles}
                title="Brief"
                description="The agent already has your brand voice, audience and pain points from the strategy — this is what it needs on top."
              />

              <Field label="Topic" required>
                <Textarea
                  rows={3}
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Why most Kubernetes incident runbooks go stale, and what to do instead"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Target keyword" hint="Optional.">
                  <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="kubernetes runbooks" />
                </Field>
                <Field label="Length" hint={`About ${Math.round(wordCount / 220)} minutes to read.`}>
                  <Input
                    type="number" min={400} max={4000} step={100}
                    value={wordCount}
                    onChange={e => setWordCount(Number(e.target.value) || 1200)}
                  />
                </Field>
              </div>

              <Field label="Anything else it should know" hint="Angles to take, claims to avoid, a product to mention.">
                <Textarea
                  rows={3}
                  value={extraContext}
                  onChange={e => setExtraContext(e.target.value)}
                  placeholder="Avoid comparing to named competitors. Mention our incident timeline feature once."
                />
              </Field>

              <Button
                variant="accent"
                size="lg"
                className="w-full"
                icon={Sparkles}
                loading={writing}
                onClick={handleWrite}
                disabled={!topic.trim() || writing}
              >
                {writing ? 'Writing…' : 'Write the article'}
              </Button>
            </Card>

            {article && (
              <Card className="space-y-4">
                <CardHeader icon={Send} title="Send to WordPress" />

                {!wordpress ? (
                  <EmptyState
                    icon={Globe}
                    title="No WordPress site connected"
                    description="Connect one in Integrations and the article can go straight across as a draft."
                    action={<Button variant="secondary" onClick={() => navigate('/integrations')}>Open Integrations</Button>}
                  />
                ) : (
                  <>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-sunk p-3.5">
                      <input
                        type="checkbox"
                        checked={publishLive}
                        onChange={e => setPublishLive(e.target.checked)}
                        className="mt-0.5 rounded border-line-strong"
                      />
                      <span className="text-[11px] leading-relaxed text-ink-2">
                        <span className="font-bold text-ink">Publish live immediately.</span> Leave this off and the
                        article arrives as a draft you can review in WordPress first.
                      </span>
                    </label>

                    <Button
                      variant={publishLive ? 'accent' : 'primary'}
                      className="w-full"
                      icon={Send}
                      loading={publishing}
                      onClick={handlePublish}
                    >
                      {publishLive ? 'Publish live to WordPress' : 'Send as draft'}
                    </Button>
                  </>
                )}
              </Card>
            )}
          </div>

          <div className="lg:col-span-7">
            {!article ? (
              <Card>
                <EmptyState
                  icon={FileText}
                  title="Nothing written yet"
                  description="Give the agent a topic and it will return a structured article with headings, a meta description and a slug."
                />
              </Card>
            ) : (
              <Card className="space-y-5">
                <CardHeader
                  icon={Eye}
                  title="Preview"
                  description={`/${article.slug}`}
                  actions={
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={copied ? Check : Copy}
                      onClick={() => {
                        navigator.clipboard.writeText(article.bodyHtml);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? 'Copied' : 'Copy HTML'}
                    </Button>
                  }
                />

                <div className="space-y-2">
                  <Input
                    value={article.title}
                    onChange={e => setArticle({ ...article, title: e.target.value })}
                    className="!text-lg !font-bold"
                  />
                  <p className="text-[11px] text-ink-3">{article.metaDescription}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(article.categories || []).map(c => <Badge key={c} tone="accent">{c}</Badge>)}
                    {(article.tags || []).slice(0, 6).map(t => <Badge key={t} tone="neutral">{t}</Badge>)}
                  </div>
                </div>

                <div
                  className="scroll-slim max-h-[560px] space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-5 text-sm leading-relaxed text-ink-2
                    [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic
                    [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink
                    [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-ink
                    [&_li]:mb-1 [&_p]:mb-3 [&_strong]:font-bold [&_strong]:text-ink
                    [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
                />

                {article.featuredImagePrompt && (
                  <div className="space-y-1.5 rounded-xl border border-line bg-sunk p-4">
                    <SectionLabel>Header image direction</SectionLabel>
                    <p className="text-[11px] leading-relaxed text-ink-3">{article.featuredImagePrompt}</p>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'published' && (
        <Card padded={false}>
          {articles.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nothing sent yet"
              description="Articles sent to WordPress are listed here with their status and link."
            />
          ) : (
            <div className="divide-y divide-line">
              {articles.map(a => (
                <div key={a.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-bold text-ink">{a.title}</p>
                    <p className="text-[11px] text-ink-3">
                      {new Date(a.createdAt).toLocaleString()}
                      {a.slug ? ` · /${a.slug}` : ''}
                    </p>
                    {a.error && <p className="text-[11px] text-danger">{a.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={a.status === 'published' ? 'ok' : a.status === 'failed' ? 'danger' : 'warn'}>
                      {a.status}
                    </Badge>
                    {a.url && (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:text-accent-hover"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
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
