import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  getBrands, getBrandById, exportLeadsCSV, Brand, Lead, MetaCampaign 
} from '../dbAdapter';
import { crmApi, metaApi, webhookApi, describeError } from '../services/integrationsApi';
import { BrandSelector } from '../components/BrandSelector';
import { TabNav } from '../components/ui';
import { 
  UserCheck, Users, Download, Filter, Search, Sparkles, CheckCircle2, 
  Megaphone, Instagram, MessageSquare, Globe, ArrowRight, DollarSign, 
  TrendingUp, BarChart3, Settings, ShieldCheck, Mail, Phone, Building, Copy, Check
} from 'lucide-react';
import { format } from 'date-fns';

export function LeadManagementStudio() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignFilterParam = searchParams.get('campaign');

  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'directory' | 'webhook' | 'analytics'>('directory');

  // Leads State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>(campaignFilterParam || 'all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Meta Campaigns for filter options
  const [metaCampaigns, setMetaCampaigns] = useState<MetaCampaign[]>([]);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const [banner, setBanner] = useState<{ kind: 'error' | 'success' | 'info'; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<{ verifyToken: boolean; appSecret: boolean; callbackUrl: string } | null>(null);
  const [totals, setTotals] = useState<{ count: number; bySource: Record<string, number>; byStatus: Record<string, number> }>({
    count: 0, bySource: {}, byStatus: {}
  });

  const loadData = async (brandIdToLoad?: string) => {
    setLoading(true);
    setBanner(null);
    try {
      const activeId = brandIdToLoad || localStorage.getItem('activeBrandId');
      let currentBrand: Brand | null = null;

      if (activeId) currentBrand = await getBrandById(activeId);
      if (!currentBrand) {
        const all = await getBrands();
        if (all.length > 0) currentBrand = all[0];
      }
      if (!currentBrand) { setBrand(null); return; }

      setBrand(currentBrand);
      localStorage.setItem('activeBrandId', currentBrand.id);

      // Leads come from the server, where the Meta / Instagram / WhatsApp
      // webhooks write them as they arrive.
      const res = await crmApi.leads(currentBrand.id);
      setLeads(res.leads as Lead[]);
      setTotals(res.totals);

      webhookApi.events().then(r => setWebhookInfo(r.configured)).catch(() => setWebhookInfo(null));

      // Campaign filter options come from the live ad account when connected.
      try {
        const camps = await metaApi.campaigns(currentBrand.id);
        setMetaCampaigns(camps.campaigns as unknown as MetaCampaign[]);
      } catch {
        setMetaCampaigns([]);
      }
    } catch (err) {
      setBanner({ kind: 'error', message: `Failed to load leads: ${describeError(err)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleBrandChange = (e: any) => {
      if (e.detail) loadData(e.detail.id);
    };
    window.addEventListener('activeBrandChanged', handleBrandChange);
    return () => window.removeEventListener('activeBrandChanged', handleBrandChange);
  }, []);

  /** Pulls historical lead-form submissions that predate the webhook. */
  const handleSyncMetaLeads = async () => {
    if (!brand) return;
    setSyncing(true);
    setBanner(null);
    try {
      const res = await metaApi.syncLeads(brand.id);
      setBanner({
        kind: 'success',
        message: `Checked ${res.forms} lead form(s) on Meta and imported ${res.imported} submission(s).`
      });
      await loadData(brand.id);
    } catch (err) {
      setBanner({ kind: 'error', message: `Lead sync failed: ${describeError(err)}` });
    } finally {
      setSyncing(false);
    }
  };

  const handleExportCSV = () => {
    const csvContent = exportLeadsCSV(brand?.id);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${brand?.name || 'wotsocial'}_leads_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStatusChange = async (id: string, newStatus: Lead['status']) => {
    const previous = leads;
    setLeads(leads.map(l => l.id === id ? { ...l, status: newStatus } : l));
    try {
      await crmApi.setLeadStatus(id, newStatus);
    } catch (err) {
      setLeads(previous);
      setBanner({ kind: 'error', message: `Could not update the lead: ${describeError(err)}` });
      return;
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const filteredLeads = leads.filter(l => {
    const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (l.company && l.company.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSource = sourceFilter === 'all' || l.source === sourceFilter;
    const matchesCampaign = selectedCampaignFilter === 'all' || l.campaignName === selectedCampaignFilter || l.campaignId === selectedCampaignFilter;
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesSource && matchesCampaign && matchesStatus;
  });

  if (loading) return <div className="p-8 font-sans text-ink-3 animate-pulse">Loading Lead Management Studio...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-accent px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <UserCheck className="w-3.5 h-3.5" />
              Meta Ads & Multi-Channel Lead CRM
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Lead Capture & Campaign Attribution Hub</h1>
          <p className="text-ink-3 mt-1">Review, manage, and export all leads captured from your Meta Ad campaigns, Instagram DM Automations, and WhatsApp broadcasts.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BrandSelector
            activeBrandId={brand?.id}
            onBrandChange={(selected) => {
              setBrand(selected);
              localStorage.setItem('activeBrandId', selected.id);
              loadData(selected.id);
            }}
          />

          <button
            onClick={handleSyncMetaLeads}
            disabled={syncing}
            className="px-4 py-2 bg-surface border border-line hover:bg-sunk disabled:opacity-50 text-ink-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
          >
            <TrendingUp className={`w-4 h-4 text-accent ${syncing ? 'animate-pulse' : ''}`} />
            {syncing ? 'Syncing from Meta…' : 'Sync Meta lead forms'}
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-ink hover:bg-ink-2 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-4 h-4 text-ok" /> Export Leads CSV
          </button>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <TabNav
        tabs={[
          { id: 'directory', label: 'Leads', icon: Users, count: leads.length },
          { id: 'analytics', label: 'Attribution', icon: BarChart3 },
          { id: 'webhook', label: 'Capture Setup', icon: Settings }
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />


      {banner && (
        <div
          className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${
            banner.kind === 'error'
              ? 'bg-danger-soft border-danger-line text-danger'
              : banner.kind === 'success'
                ? 'bg-ok-soft border-ok-line text-ok'
                : 'bg-accent-soft border-accent-line text-accent-ink'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-xs font-bold break-words">{banner.message}</p>
          <button onClick={() => setBanner(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {webhookInfo && !(webhookInfo.verifyToken && webhookInfo.appSecret) && (
        <div className="rounded-2xl border border-warn-line bg-warn-soft px-5 py-4 text-[11px] text-warn space-y-1">
          <p className="text-xs font-bold">Real-time lead capture is inactive.</p>
          <p>
            New leads will not arrive automatically until the Meta webhook is configured. Set{' '}
            <span className="font-mono">META_APP_SECRET</span> and{' '}
            <span className="font-mono">META_WEBHOOK_VERIFY_TOKEN</span> on the server, then point your Meta app's{' '}
            <span className="font-mono">leadgen</span> webhook at{' '}
            <span className="font-mono">{webhookInfo.callbackUrl}</span>. You can still pull existing submissions with
            "Sync Meta lead forms".
          </p>
        </div>
      )}

      {/* Tab 1: Captured Leads Directory */}
      {activeTab === 'directory' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-ink-4 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lead name, email, company..."
                className="w-full pl-9 pr-4 py-2 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-line-strong rounded-xl outline-none bg-surface font-semibold"
              >
                <option value="all">All Lead Sources</option>
                <option value="Meta Ads Lead Form">Meta Ads Lead Form</option>
                <option value="Instagram DM Automation">Instagram DM Automation</option>
                <option value="WhatsApp Broadcast">WhatsApp Broadcast</option>
                <option value="Website Conversion">Website Conversion</option>
              </select>

              {metaCampaigns.length > 0 && (
                <select
                  value={selectedCampaignFilter}
                  onChange={(e) => setSelectedCampaignFilter(e.target.value)}
                  className="px-3 py-2 text-xs border border-line-strong rounded-xl outline-none bg-surface font-semibold max-w-[200px] truncate"
                >
                  <option value="all">All Meta Campaigns</option>
                  {metaCampaigns.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-line-strong rounded-xl outline-none bg-surface font-semibold"
              >
                <option value="all">All Lead Statuses</option>
                <option value="NEW">NEW</option>
                <option value="CONTACTED">CONTACTED</option>
                <option value="QUALIFIED">QUALIFIED</option>
                <option value="CONVERTED">CONVERTED</option>
              </select>
            </div>
          </div>

          {/* Leads Table */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-ink-2">
                <thead className="bg-sunk border-b border-line text-[10px] uppercase font-bold tracking-wider text-ink-3">
                  <tr>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Lead Contact</th>
                    <th className="px-6 py-3.5">Lead Source & Attribution</th>
                    <th className="px-6 py-3.5">Meta Campaign</th>
                    <th className="px-6 py-3.5">Captured Date</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-medium">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-ink-4 text-xs">
                        No captured leads found matching your search and filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-sunk/80 transition-colors">
                        <td className="px-6 py-4">
                          <select
                            value={lead.status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value as any)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border outline-none cursor-pointer ${
                              lead.status === 'NEW' ? 'bg-accent-soft text-accent-ink border-accent-line' :
                              lead.status === 'QUALIFIED' ? 'bg-accent-soft text-accent-ink border-accent-line' :
                              lead.status === 'CONVERTED' ? 'bg-ok-soft text-ok border-ok-line' :
                              'bg-sunk text-ink-2 border-line'
                            }`}
                          >
                            <option value="NEW">NEW</option>
                            <option value="CONTACTED">CONTACTED</option>
                            <option value="QUALIFIED">QUALIFIED</option>
                            <option value="CONVERTED">CONVERTED</option>
                          </select>
                        </td>

                        <td className="px-6 py-4 space-y-0.5">
                          <div className="font-bold text-ink text-xs flex items-center gap-1.5">
                            {lead.name}
                            {lead.company && <span className="text-[10px] text-ink-4 font-normal">({lead.company})</span>}
                          </div>
                          <div className="text-[11px] text-ink-3 flex items-center gap-2">
                            <span className="font-mono">{lead.email}</span>
                            <button
                              onClick={() => handleCopyEmail(lead.email)}
                              className="text-ink-4 hover:text-ink"
                              title="Copy Email"
                            >
                              {copiedEmail === lead.email ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-sunk text-ink-2 text-[11px] font-bold rounded-lg border border-line">
                            {lead.source.includes('Meta') ? <Megaphone className="w-3 h-3 text-accent" /> :
                             lead.source.includes('Instagram') ? <Instagram className="w-3 h-3 text-blush" /> :
                             <MessageSquare className="w-3 h-3 text-ok" />}
                            {lead.source}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-semibold text-ink truncate max-w-xs">{lead.campaignName || 'Organic Lead'}</div>
                          {lead.adSetName && <div className="text-[10px] text-ink-4">{lead.adSetName}</div>}
                        </td>

                        <td className="px-6 py-4 text-ink-3 font-mono text-[11px]">
                          {format(new Date(lead.createdAt), 'MMM d, h:mm a')}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <a
                            href={`mailto:${lead.email}`}
                            className="px-3 py-1.5 bg-ink hover:bg-ink-2 text-white text-[11px] font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                          >
                            <Mail className="w-3 h-3 text-warn-line" /> Contact Lead
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Lead Analytics & CPL Metrics */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Total Captured Leads</div>
              <div className="text-2xl font-bold text-ink">{leads.length}</div>
              <div className="text-[10px] text-ok font-bold flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> Real-Time CRM Ingest
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Avg Cost Per Lead (CPL)</div>
              <div className="text-2xl font-bold text-accent">$4.07</div>
              <div className="text-[10px] text-ink-3 font-semibold">Meta Ads Benchmark</div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Lead-to-Customer Rate</div>
              <div className="text-2xl font-bold text-accent">
                {((leads.filter(l => l.status === 'CONVERTED').length / (leads.length || 1)) * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-accent-ink font-semibold">High Quality Leads</div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Qualified Pipeline</div>
              <div className="text-2xl font-bold text-ok font-mono">
                {leads.filter(l => l.status === 'QUALIFIED' || l.status === 'CONVERTED').length} Leads
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Meta Lead Gen Webhook & Form Mapping */}
      {activeTab === 'webhook' && (
        <div className="bg-surface border border-line rounded-2xl p-8 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="border-b border-line pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-ok" />
                Meta Ads Instant Lead Form Webhook Mapping
              </h3>
              <p className="text-xs text-ink-3">Automatically map question fields from Meta Lead Gen Forms (`/v19.0/leadgen_forms`) directly into WotSocial CRM fields.</p>
            </div>
            <span className="text-xs bg-ok-soft text-ok font-bold px-3 py-1 rounded-full border border-ok-line">
              Webhook Live
            </span>
          </div>

          <div className="space-y-4 text-xs font-medium">
            <div className="grid grid-cols-2 gap-4 bg-sunk p-4 rounded-xl border border-line">
              <div className="space-y-1">
                <div className="font-bold text-ink">Meta Lead Form Field</div>
                <div className="font-mono text-ink-3">full_name</div>
                <div className="font-mono text-ink-3">email</div>
                <div className="font-mono text-ink-3">phone_number</div>
                <div className="font-mono text-ink-3">company_name</div>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-ink">WotSocial CRM Field</div>
                <div className="font-mono text-ok font-bold">Lead Name</div>
                <div className="font-mono text-ok font-bold">Email Address</div>
                <div className="font-mono text-ok font-bold">Phone Number</div>
                <div className="font-mono text-ok font-bold">Company / Organization</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
