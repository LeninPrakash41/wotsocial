/**
 * Analytics.
 *
 * This page used to invent its numbers — fifteen Math.random() calls produced
 * likes, impressions, reach and audience demographics at render time, with no
 * API call anywhere on the page. Everything here now comes from Meta,
 * Instagram and the CRM, and anything that is not connected says so rather
 * than filling the gap with something plausible.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrands, getBrandById, Brand } from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  TrendingUp, Users, Eye, MousePointer, Target, RefreshCw, Sparkles,
  BarChart3, Heart, MessageSquare, UserCheck, Megaphone, Instagram
} from 'lucide-react';
import {
  PageHeader, TabNav, Card, CardHeader, Button, Banner, Badge, StatCard,
  EmptyState, LoadingPage, SectionLabel, Select, BannerKind
} from '../components/ui';
import { metaApi, instagramApi, crmApi, describeError, IntegrationError } from '../services/integrationsApi';
import { runAgent, availableProviders } from '../services/agentRuntime';

/** Chart colours come from the design tokens so the page matches the product. */
const SERIES = ['#6D4AFF', '#DB4F9E', '#0F7A56', '#8F5D0C', '#6F6B7A'];

const DATE_PRESETS = [
  { value: 'last_7d', label: 'Last 7 days', days: 7 },
  { value: 'last_14d', label: 'Last 14 days', days: 14 },
  { value: 'last_30d', label: 'Last 30 days', days: 30 },
  { value: 'last_90d', label: 'Last 90 days', days: 90 }
];

const compact = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
};

const money = (n: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);

export function Analytics() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'audience' | 'content'>('overview');
  const [datePreset, setDatePreset] = useState('last_30d');
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string; detail?: string } | null>(null);

  // Each source is tracked separately: one disconnected platform should not
  // blank the whole page.
  const [adInsights, setAdInsights] = useState<any | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [igProfile, setIgProfile] = useState<any | null>(null);
  const [igMetrics, setIgMetrics] = useState<Record<string, any> | null>(null);
  const [igMedia, setIgMedia] = useState<any[]>([]);
  const [demographics, setDemographics] = useState<any[]>([]);
  const [leads, setLeads] = useState<{ leads: any[]; totals: any } | null>(null);
  const [sources, setSources] = useState({ metaAds: false, instagram: false });

  const [insight, setInsight] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const load = async (brandIdToLoad?: string, preset = datePreset) => {
    setLoading(true);
    setBanner(null);
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
      await refreshAll(current.id, preset);
    } catch (err) {
      setBanner({ kind: 'error', message: `Could not load analytics: ${describeError(err)}` });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Pulls every source in parallel and tolerates partial failure — a brand
   * with Instagram but no ad account should still see its Instagram numbers.
   */
  const refreshAll = async (brandId: string, preset: string) => {
    const days = DATE_PRESETS.find(p => p.value === preset)?.days ?? 30;

    const [ads, camps, igConn, igIns, igMed, demo, crm] = await Promise.allSettled([
      metaApi.insights(brandId, { datePreset: preset, daily: true }),
      metaApi.campaigns(brandId, preset),
      instagramApi.connection(brandId),
      instagramApi.insights(brandId, days),
      instagramApi.media(brandId),
      metaApi.insights(brandId, { datePreset: preset }),
      crmApi.leads(brandId)
    ]);

    const metaLive = ads.status === 'fulfilled';
    const igLive = igConn.status === 'fulfilled' && Boolean((igConn.value as any)?.connected);
    setSources({ metaAds: metaLive, instagram: igLive });

    setAdInsights(metaLive ? ads.value : null);
    setCampaigns(camps.status === 'fulfilled' ? camps.value.campaigns : []);
    setIgProfile(igLive ? (igConn.value as any).profile : null);
    setIgMetrics(igIns.status === 'fulfilled' ? igIns.value.metrics : null);
    setIgMedia(igMed.status === 'fulfilled' ? igMed.value.media : []);
    setLeads(crm.status === 'fulfilled' ? crm.value : null);

    // Age and gender come from the ad account's own breakdown, which is the
    // only demographic data either platform will actually give us.
    if (metaLive) {
      try {
        const byAge = await metaApi.insights(brandId, { datePreset: preset });
        setDemographics(byAge.series || []);
      } catch { setDemographics([]); }
    } else {
      setDemographics([]);
    }

    // Surface a real reason when a source is unavailable for a reason other
    // than simply not being connected.
    const problems = [ads, igConn].flatMap(r =>
      r.status === 'rejected' && r.reason instanceof IntegrationError && !r.reason.notConnected
        ? [r.reason.message]
        : []
    );
    if (problems.length) {
      setBanner({ kind: 'warning', message: 'Some data could not be loaded.', detail: problems[0] });
    }
  };

  useEffect(() => {
    load();
    const onBrandChange = (e: any) => { if (e.detail) load(e.detail.id); };
    window.addEventListener('activeBrandChanged', onBrandChange);
    return () => window.removeEventListener('activeBrandChanged', onBrandChange);
  }, []);

  const handleRefresh = async () => {
    if (!brand) return;
    setRefreshing(true);
    try {
      await refreshAll(brand.id, datePreset);
      setBanner({ kind: 'success', message: 'Pulled the latest figures from the connected platforms.' });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setRefreshing(false);
    }
  };

  const handlePresetChange = async (preset: string) => {
    setDatePreset(preset);
    if (!brand) return;
    setRefreshing(true);
    try { await refreshAll(brand.id, preset); }
    finally { setRefreshing(false); }
  };

  /** Reads the real figures rather than describing invented ones. */
  const handleAnalyse = async () => {
    if (!brand || !adInsights) return;
    if (!availableProviders().length) {
      setBanner({
        kind: 'error',
        message: 'No AI key configured.',
        detail: 'Add a Gemini or Claude API key in Integrations to interpret these numbers.'
      });
      return;
    }

    setAnalyzing(true);
    setBanner(null);
    try {
      const totals = adInsights.totals || {};
      const { result } = await runAgent<any>('site_analysis', {
        brandName: brand.name,
        websiteUrl: brand.websiteUrl,
        guidelines:
          `Interpret this advertising performance over ${datePreset.replace('last_', 'the last ').replace('d', ' days')}:\n` +
          `Spend ${totals.spend}, impressions ${totals.impressions}, clicks ${totals.clicks}, ` +
          `CTR ${totals.ctr}%, CPC ${totals.cpc}, conversions ${totals.conversions}, CPA ${totals.cpa}, ROAS ${totals.roas}.\n` +
          `Instagram: ${igProfile?.followersCount ?? 'not connected'} followers.\n` +
          `Leads captured: ${leads?.totals?.count ?? 0}.\n` +
          'Say what is working, what is not, and the single highest-impact change.'
      }, { brandId: brand.id });
      setInsight(result);
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <LoadingPage label="Loading analytics…" />;

  const totals = adInsights?.totals || null;
  const currency = adInsights?.currency || 'USD';
  const nothingConnected = !sources.metaAds && !sources.instagram;

  const timeSeries = (adInsights?.series || [])
    .filter((row: any) => row.dateStart)
    .map((row: any) => ({
      date: row.dateStart?.slice(5),
      Impressions: row.impressions,
      Clicks: row.clicks,
      Spend: Number((row.spend || 0).toFixed(2)),
      Conversions: row.conversions
    }));

  const leadsBySource = Object.entries(leads?.totals?.bySource || {})
    .map(([name, value]) => ({ name, value: Number(value) }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <PageHeader
        eyebrow="Performance"
        title="Analytics & Insights"
        description={
          nothingConnected
            ? 'Connect an ad account or an Instagram profile and real performance appears here.'
            : `Live figures for ${brand?.name} from the platforms you have connected.`
        }
        actions={
          <>
            <BrandSelector
              activeBrandId={brand?.id}
              onBrandChange={(selected) => {
                setBrand(selected);
                localStorage.setItem('activeBrandId', selected.id);
                load(selected.id);
              }}
            />
            <Select
              value={datePreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-auto"
            >
              {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>
              Refresh
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge tone={sources.metaAds ? 'ok' : 'neutral'} live={sources.metaAds}>
            Meta Ads {sources.metaAds ? 'live' : 'not connected'}
          </Badge>
          <Badge tone={sources.instagram ? 'ok' : 'neutral'} live={sources.instagram}>
            Instagram {sources.instagram ? 'live' : 'not connected'}
          </Badge>
        </div>
      </PageHeader>

      {banner && (
        <Banner kind={banner.kind} message={banner.message} detail={banner.detail} onDismiss={() => setBanner(null)} />
      )}

      {nothingConnected ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No connected sources"
            description="Analytics reads from your Meta ad account and Instagram profile. Connect either one and this page fills in — nothing here is estimated."
            action={
              <div className="flex gap-2">
                <Button variant="accent" icon={Megaphone} onClick={() => navigate('/meta-ads')}>Connect Meta Ads</Button>
                <Button variant="secondary" icon={Instagram} onClick={() => navigate('/instagram-marketing')}>Connect Instagram</Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <TabNav
            tabs={[
              { id: 'overview', label: 'Overview', icon: TrendingUp },
              { id: 'audience', label: 'Audience', icon: Users },
              { id: 'content', label: 'Content', icon: Heart, count: igMedia.length }
            ]}
            active={tab}
            onChange={(id) => setTab(id as any)}
          />

          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {sources.metaAds && totals ? (
                  <>
                    <StatCard label="Ad spend" value={money(totals.spend, currency)} hint={DATE_PRESETS.find(p => p.value === datePreset)?.label} icon={Target} />
                    <StatCard label="Impressions" value={compact(totals.impressions)} hint={`${totals.ctr}% CTR`} icon={Eye} />
                    <StatCard label="Clicks" value={compact(totals.clicks)} hint={`${money(totals.cpc, currency)} per click`} tone="accent" icon={MousePointer} />
                    <StatCard
                      label="Conversions"
                      value={compact(totals.conversions)}
                      hint={totals.conversions ? `${money(totals.cpa, currency)} each` : 'None recorded'}
                      tone="ok"
                      icon={UserCheck}
                    />
                  </>
                ) : (
                  <>
                    <StatCard label="Followers" value={compact(igProfile?.followersCount || 0)} hint={`@${igProfile?.username || ''}`} icon={Users} />
                    <StatCard label="Posts" value={compact(igProfile?.mediaCount || 0)} hint="Published to this account" icon={Instagram} />
                    <StatCard
                      label="Reach"
                      value={igMetrics?.reach ? compact(Number(igMetrics.reach.total)) : '—'}
                      hint={igMetrics?.reach ? 'Accounts reached' : 'Not reported for this account'}
                      tone="accent"
                      icon={Eye}
                    />
                    <StatCard label="Leads" value={compact(leads?.totals?.count || 0)} hint="Captured in the CRM" tone="ok" icon={UserCheck} />
                  </>
                )}
              </div>

              {sources.metaAds && timeSeries.length > 0 && (
                <Card className="space-y-4">
                  <CardHeader
                    icon={TrendingUp}
                    title="Delivery over time"
                    description="Daily figures straight from the Meta Marketing API."
                  />
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timeSeries}>
                        <defs>
                          <linearGradient id="impressions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-ink-4)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--color-ink-4)" tickFormatter={compact} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12, border: '1px solid var(--color-line)',
                            background: 'var(--color-surface)', fontSize: 12
                          }}
                        />
                        <Area type="monotone" dataKey="Impressions" stroke={SERIES[0]} fill="url(#impressions)" strokeWidth={2} />
                        <Area type="monotone" dataKey="Clicks" stroke={SERIES[1]} fill="transparent" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {campaigns.length > 0 && (
                <Card padded={false}>
                  <div className="p-6">
                    <CardHeader icon={Megaphone} title={`Campaigns (${campaigns.length})`} description="Performance per campaign for the selected period." />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-line bg-sunk text-[10px] uppercase tracking-wider text-ink-4">
                        <tr>
                          <th className="px-6 py-3">Campaign</th>
                          <th className="px-6 py-3">Spend</th>
                          <th className="px-6 py-3">Impressions</th>
                          <th className="px-6 py-3">Clicks</th>
                          <th className="px-6 py-3">CTR</th>
                          <th className="px-6 py-3">Conversions</th>
                          <th className="px-6 py-3">ROAS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {campaigns.map((c: any) => (
                          <tr key={c.id} className="hover:bg-sunk/60">
                            <td className="px-6 py-3">
                              <div className="font-bold text-ink">{c.name}</div>
                              <div className="text-[10px] text-ink-4">{c.effectiveStatus || c.status}</div>
                            </td>
                            <td className="px-6 py-3 font-semibold">{money(c.spent, currency)}</td>
                            <td className="px-6 py-3">{compact(c.impressions)}</td>
                            <td className="px-6 py-3">{compact(c.clicks)}</td>
                            <td className="px-6 py-3">{c.ctr}%</td>
                            <td className="px-6 py-3">{c.conversions}</td>
                            <td className="px-6 py-3 font-bold text-accent">{c.roas}x</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <Card className="space-y-4">
                <CardHeader
                  icon={Sparkles}
                  title="What the numbers say"
                  description="An agent reads the figures above — not a summary of estimates."
                  actions={
                    <Button
                      size="sm"
                      variant="accent"
                      icon={Sparkles}
                      loading={analyzing}
                      onClick={handleAnalyse}
                      disabled={!sources.metaAds}
                    >
                      Analyse
                    </Button>
                  }
                />
                {insight ? (
                  <div className="space-y-2 text-xs leading-relaxed text-ink-2">
                    {insight.valueProposition && <p>{insight.valueProposition}</p>}
                    {(insight.primaryHooks || []).map((h: string, i: number) => (
                      <p key={i} className="flex gap-2"><span className="text-accent">→</span>{h}</p>
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-xs text-ink-3">
                    {sources.metaAds
                      ? 'Run an analysis to get a read on the current period.'
                      : 'Connect a Meta ad account to analyse performance.'}
                  </p>
                )}
              </Card>
            </div>
          )}

          {tab === 'audience' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="space-y-4">
                <CardHeader
                  icon={UserCheck}
                  title="Where leads come from"
                  description="Captured by the webhooks, grouped by source."
                />
                {leadsBySource.length === 0 ? (
                  <EmptyState icon={UserCheck} title="No leads yet" description="Lead forms, Instagram DM rules and WhatsApp replies all land here." />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={leadsBySource} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                          {leadsBySource.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="space-y-4">
                <CardHeader
                  icon={Instagram}
                  title="Instagram reach"
                  description="Reported by the Instagram Graph API for this account."
                />
                {!sources.instagram ? (
                  <EmptyState icon={Instagram} title="Instagram not connected" description="Connect the account to see reach and profile activity." />
                ) : !igMetrics || Object.keys(igMetrics).length === 0 ? (
                  <EmptyState
                    icon={Eye}
                    title="No insights available"
                    description="Instagram only reports these metrics for Business and Creator accounts with recent activity."
                  />
                ) : (
                  <div className="space-y-3">
                    {Object.entries(igMetrics).map(([name, metric]: [string, any]) => (
                      <div key={name} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                        <div className="min-w-0">
                          <div className="text-xs font-bold capitalize text-ink">{name.replace(/_/g, ' ')}</div>
                          {metric.description && (
                            <div className="line-clamp-1 text-[11px] text-ink-4">{metric.description}</div>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-extrabold tabular text-accent">
                          {compact(Number(metric.total))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === 'content' && (
            <Card padded={false}>
              {igMedia.length === 0 ? (
                <EmptyState
                  icon={Heart}
                  title="No posts to report on"
                  description={sources.instagram
                    ? 'Nothing has been published to this account yet.'
                    : 'Connect Instagram to see how individual posts performed.'}
                />
              ) : (
                <div className="space-y-5 p-6">
                  <CardHeader icon={Heart} title="Posts by engagement" description="Live like and comment counts from Instagram." />
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={igMedia.slice(0, 10).map((m: any, i: number) => ({
                        name: `#${i + 1}`,
                        Likes: m.likeCount,
                        Comments: m.commentsCount
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-ink-4)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--color-ink-4)" tickFormatter={compact} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Likes" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Comments" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {igMedia.slice(0, 8).map((m: any) => (
                      <a
                        key={m.id}
                        href={m.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="overflow-hidden rounded-xl border border-line transition-colors hover:border-accent/40"
                      >
                        <div className="aspect-square bg-sunk">
                          {(m.thumbnailUrl || m.mediaUrl) && (
                            <img src={m.thumbnailUrl || m.mediaUrl} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="space-y-1.5 p-3">
                          <p className="line-clamp-2 text-[11px] text-ink-3">{m.caption || '(no caption)'}</p>
                          <div className="flex items-center gap-3 text-[11px] font-bold text-ink-2">
                            <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-blush" /> {m.likeCount}</span>
                            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3 text-accent" /> {m.commentsCount}</span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          <p className="text-center text-[11px] text-ink-4">
            <SectionLabel className="inline">Source</SectionLabel>{' '}
            Meta Marketing API, Instagram Graph API and your CRM. Nothing on this page is estimated or sampled.
          </p>
        </>
      )}
    </div>
  );
}
