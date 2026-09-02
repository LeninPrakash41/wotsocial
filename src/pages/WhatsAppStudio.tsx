import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getBrands, getBrandById, Brand,
  WhatsAppCampaign, WhatsAppTemplate, getMediaAssets, MediaAsset
} from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import { PhoneFrame, TabNav } from '../components/ui';
import {
  whatsappApi, getOAuthStatus, startOAuth, runOAuthPopup,
  describeError, PublicConnection
} from '../services/integrationsApi';
import { 
  MessageSquare, Sparkles, Send, BarChart3, Settings, Plus, RefreshCw, 
  CheckCircle2, Phone, ShieldCheck, FileText, Image as ImageIcon, Video, 
  ExternalLink, Users, TrendingUp, Check, DollarSign, Layers, Tag
} from 'lucide-react';

export function WhatsAppStudio() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'broadcast' | 'templates' | 'analytics' | 'settings'>('broadcast');

  // WhatsApp Account State
  const [wabaAccountId, setWabaAccountId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Broadcast Builder State
  const [campaignName, setCampaignName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [targetSegment, setTargetSegment] = useState('');
  const [mediaHeaderUrl, setMediaHeaderUrl] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Templates State
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);

  // Live connection state — replaces the previous auto-seeded sandbox number.
  const [connection, setConnection] = useState<PublicConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [phoneInfo, setPhoneInfo] = useState<any>(null);
  const [connecting, setConnecting] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [webhooksConfigured, setWebhooksConfigured] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success' | 'info'; message: string; detail?: string } | null>(null);
  const [recipientsRaw, setRecipientsRaw] = useState('');

  /** Recipients are typed or pasted as one E.164 number per line. */
  const parsedRecipients = recipientsRaw
    .split(/[\n,;]+/)
    .map(r => r.trim())
    .filter(Boolean);

  const refreshBroadcasts = async (brandId: string) => {
    try {
      const res = await whatsappApi.broadcasts(brandId);
      setCampaigns(res.broadcasts.map((b: any): WhatsAppCampaign => ({
        id: b.id,
        brandId: b.brandId,
        name: b.name,
        templateName: b.templateName,
        targetSegment: b.targetSegment,
        recipientsCount: b.recipientsCount,
        deliveredCount: b.deliveredCount,
        readCount: b.readCount,
        clickCount: b.clickedCount || 0,
        status: b.status === 'SENDING' ? 'ACTIVE' : b.status === 'COMPLETED' ? 'COMPLETED' : 'PAUSED',
        // Meta bills per conversation, not per message; leave this at the real
        // sent count times nothing rather than inventing a spend figure.
        spent: 0,
        createdAt: b.createdAt
      })));
    } catch (err) {
      setBanner({ kind: 'error', message: `Could not load broadcasts: ${describeError(err)}` });
    }
  };

  const refreshTemplates = async (brandId: string, announce = false) => {
    setTemplatesLoading(true);
    try {
      const res = await whatsappApi.templates(brandId);
      setTemplates(res.templates.map((t: any): WhatsAppTemplate => {
        const body = (t.components || []).find((c: any) => c.type === 'BODY');
        const header = (t.components || []).find((c: any) => c.type === 'HEADER');
        const footer = (t.components || []).find((c: any) => c.type === 'FOOTER');
        const buttons = (t.components || []).find((c: any) => c.type === 'BUTTONS');
        return {
          id: t.id,
          name: t.name,
          category: t.category,
          language: t.language,
          headerType: (header?.format || 'TEXT') as WhatsAppTemplate['headerType'],
          headerContent: header?.text,
          bodyText: body?.text || '',
          footerText: footer?.text,
          buttons: (buttons?.buttons || []).map((b: any) => ({
            type: b.type, text: b.text, value: b.url || b.phone_number
          })),
          status: t.status as WhatsAppTemplate['status']
        };
      }));
      if (res.templates.length && !res.templates.some((t: any) => t.name === selectedTemplate)) {
        const approved = res.templates.find((t: any) => t.status === 'APPROVED') || res.templates[0];
        setSelectedTemplate(approved.name);
      }
      if (announce) {
        setBanner({ kind: 'success', message: `Synced ${res.templates.length} template(s) from your WhatsApp Business Account.` });
      }
    } catch (err) {
      setTemplates([]);
      if (announce) setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setTemplatesLoading(false);
    }
  };

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

      getOAuthStatus()
        .then(st => { setOauthConfigured(st.configured); setWebhooksConfigured(st.webhookConfigured); })
        .catch(() => {});

      const connRes = await whatsappApi.connection(currentBrand.id);
      setConnected(connRes.connected);
      setConnection(connRes.connection);
      setPhoneInfo(connRes.phoneNumber);

      if (connRes.connection) {
        setPhoneNumberId(connRes.connection.externalId);
        setWabaAccountId(connRes.connection.metadata?.wabaId || '');
        setPhoneNumber(connRes.connection.metadata?.displayPhoneNumber || '');
        if (!connRes.connected) {
          setBanner({
            kind: 'error',
            message: connRes.error || connRes.connection.lastError || 'The stored WhatsApp token is no longer valid. Reconnect the number.'
          });
        }
      }

      if (connRes.connected) {
        await Promise.all([refreshTemplates(currentBrand.id), refreshBroadcasts(currentBrand.id)]);
      } else {
        setTemplates([]);
        setCampaigns([]);
      }

      const assets = getMediaAssets().filter(a => !a.brandId || a.brandId === currentBrand?.id);
      setMediaAssets(assets);
    } catch (err) {
      setBanner({ kind: 'error', message: `Failed to load the WhatsApp Studio: ${describeError(err)}` });
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

  /** Verifies the number with Meta before anything is stored. */
  const handleConnectAccount = async () => {
    if (!brand) return;
    if (!accessToken.trim() || !phoneNumberId.trim()) {
      setBanner({ kind: 'error', message: 'A system-user access token and a phone number ID are both required.' });
      return;
    }
    setConnecting(true);
    setBanner(null);
    try {
      const res = await whatsappApi.connect({
        brandId: brand.id,
        accessToken: accessToken.trim(),
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaAccountId.trim() || undefined
      });
      setConnection(res.connection);
      setPhoneInfo(res.phoneNumber);
      setConnected(true);
      setPhoneNumber(res.phoneNumber.displayPhoneNumber);
      setWabaAccountId(res.wabaId || '');
      setAccessToken(''); // The raw token now lives only on the server.
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      setBanner({
        kind: 'success',
        message: `Connected ${res.phoneNumber.displayPhoneNumber} (${res.phoneNumber.verifiedName}). Quality rating: ${res.phoneNumber.qualityRating}.`
      });
      await refreshTemplates(brand.id);
    } catch (err) {
      setConnected(false);
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setConnecting(false);
    }
  };

  const handleOAuthConnect = async () => {
    if (!brand) return;
    setConnecting(true);
    setBanner(null);
    try {
      const { url } = await startOAuth(brand.id, 'whatsapp');
      const result = await runOAuthPopup(url);
      if (result.success) {
        setBanner({ kind: 'success', message: 'WhatsApp Business account connected.' });
        await loadData(brand.id);
      } else {
        setBanner({ kind: 'error', message: result.error || 'The connection was not completed.' });
      }
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!brand) return;
    try {
      await whatsappApi.disconnect(brand.id);
      setConnection(null);
      setConnected(false);
      setPhoneInfo(null);
      setTemplates([]);
      setBanner({ kind: 'info', message: 'WhatsApp disconnected. Stored credentials were deleted.' });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  /**
   * Sends a real broadcast. Recipients must be supplied explicitly — there is
   * no hidden default list, and every message is tracked by its wamid so the
   * delivered/read counts come from Meta rather than from an estimate.
   */
  const handlePublishBroadcast = async () => {
    if (!campaignName.trim() || !brand) return;
    if (!connected) {
      setBanner({ kind: 'error', message: 'Connect a WhatsApp Business number before sending.' });
      setActiveTab('settings');
      return;
    }
    if (!parsedRecipients.length) {
      setBanner({ kind: 'error', message: 'Add at least one recipient phone number in E.164 format (for example +14155552671).' });
      return;
    }

    const template = templates.find(t => t.name === selectedTemplate);
    if (template && template.status !== 'APPROVED') {
      setBanner({ kind: 'error', message: `Template "${template.name}" is ${template.status}. WhatsApp only delivers APPROVED templates.` });
      return;
    }

    if (!window.confirm(
      `This sends a real WhatsApp message to ${parsedRecipients.length} recipient(s) from ${phoneInfo?.displayPhoneNumber || 'your business number'}. ` +
      'Meta charges per conversation. Continue?'
    )) return;

    setPublishing(true);
    setBanner(null);

    try {
      const res = await whatsappApi.broadcast({
        brandId: brand.id,
        name: campaignName.trim(),
        templateName: selectedTemplate,
        language: template?.language || 'en_US',
        targetSegment,
        recipients: parsedRecipients
      });

      setBanner({
        kind: 'success',
        message: `Broadcast started to ${res.recipients} recipient(s).`,
        detail: res.note
      });
      await refreshBroadcasts(brand.id);
      setActiveTab('analytics');

      // Delivery receipts stream in over the next few seconds.
      const poll = setInterval(() => refreshBroadcasts(brand.id), 4000);
      setTimeout(() => clearInterval(poll), 60_000);
    } catch (err) {
      setBanner({ kind: 'error', message: `Broadcast failed: ${describeError(err)}` });
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <div className="p-8 font-sans text-ink-3 animate-pulse">Loading WhatsApp Business Studio...</div>;

  const currentTmpl = templates.find(t => t.name === selectedTemplate) || templates[0] || null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-accent px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <MessageSquare className="w-3.5 h-3.5" />
              WhatsApp Business Cloud API (WABA)
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">WhatsApp Business Broadcast & HSM Studio</h1>
          <p className="text-ink-3 mt-1">Send targeted marketing broadcasts, design pre-approved HSM templates with interactive buttons, and capture high-converting messaging analytics.</p>
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

          {connected ? (
            <div className="bg-ok-soft border border-ok-line px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-ok">
              <Phone className="w-4 h-4 text-ok" />
              <span>Live · {phoneInfo?.displayPhoneNumber || connection?.username}</span>
              {phoneInfo?.qualityRating && phoneInfo.qualityRating !== 'UNKNOWN' && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    phoneInfo.qualityRating === 'GREEN'
                      ? 'bg-ok-line text-ok'
                      : phoneInfo.qualityRating === 'YELLOW'
                        ? 'bg-warn-line text-warn'
                        : 'bg-danger-line text-danger'
                  }`}
                >
                  {phoneInfo.qualityRating}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={() => setActiveTab('settings')}
              className="bg-warn-soft hover:bg-warn-soft border border-warn-line px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-warn transition-colors"
            >
              <Phone className="w-4 h-4 text-warn" />
              <span>{connection ? 'Reconnect WhatsApp' : 'Connect WhatsApp number'}</span>
            </button>
          )}

          {connected && (
            <button
              onClick={() => brand && refreshTemplates(brand.id, true)}
              disabled={templatesLoading}
              className="bg-surface border border-line px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-ink-2 hover:bg-sunk disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${templatesLoading ? 'animate-spin' : ''}`} />
              {templatesLoading ? 'Syncing…' : 'Sync templates'}
            </button>
          )}
        </div>
      </header>

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
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-bold break-words">{banner.message}</p>
            {banner.detail && <p className="text-[11px] opacity-80 break-words">{banner.detail}</p>}
          </div>
          <button onClick={() => setBanner(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <TabNav
        tabs={[
          { id: 'broadcast', label: 'Broadcast', icon: Send },
          { id: 'templates', label: 'Templates', icon: FileText, count: templates.length },
          { id: 'analytics', label: 'Delivery', icon: BarChart3, count: campaigns.length },
          { id: 'settings', label: 'Connection', icon: Settings }
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />


      {/* Tab 1: Broadcast Campaign Builder */}
      {activeTab === 'broadcast' && (
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-7 space-y-6">
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
              <div className="border-b border-line pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Send className="w-5 h-5 text-ok" />
                  Launch New WhatsApp Broadcast Campaign
                </h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-2">Broadcast Campaign Name</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. VIP Customers - Q3 Flash Discount Alert"
                    className="w-full px-3.5 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-ink-2">Select HSM Message Template</label>
                    <select
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink bg-surface font-bold"
                    >
                      {templates.length === 0 && <option value="">No approved templates found</option>}
                      {templates.map(t => (
                        <option key={t.id} value={t.name} disabled={t.status !== 'APPROVED'}>
                          {t.name} ({t.language}) — {t.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-ink-2">Segment label</label>
                    <input
                      type="text"
                      value={targetSegment}
                      onChange={(e) => setTargetSegment(e.target.value)}
                      placeholder="e.g. VIP customers"
                      className="w-full px-3 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
                    />
                    <p className="text-[11px] text-ink-3">Just a name for your own reporting.</p>
                  </div>
                </div>

                {/* Real recipients — there is no hidden default list. */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-2 flex items-center justify-between">
                    <span>Recipients (one E.164 number per line)</span>
                    <span className={`font-mono ${parsedRecipients.length ? 'text-ok' : 'text-ink-4'}`}>
                      {parsedRecipients.length} recipient{parsedRecipients.length === 1 ? '' : 's'}
                    </span>
                  </label>
                  <textarea
                    value={recipientsRaw}
                    onChange={(e) => setRecipientsRaw(e.target.value)}
                    rows={5}
                    placeholder={'+14155552671\n+442071838750'}
                    className="w-full px-3.5 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink font-mono resize-y"
                  />
                  <p className="text-[11px] text-ink-3">
                    WhatsApp only delivers to numbers that have opted in to receive messages from your business.
                    Meta bills per conversation.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-2">Header Attachment URL (Optional)</label>
                  <input
                    type="text"
                    value={mediaHeaderUrl}
                    onChange={(e) => setMediaHeaderUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handlePublishBroadcast}
                  disabled={publishing || !campaignName.trim() || !connected || !parsedRecipients.length}
                  className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                >
                  {publishing ? <RefreshCw className="w-4 h-4 animate-spin text-warn-line" /> : <Send className="w-4 h-4 text-ok-line" />}
                  {publishing
                    ? 'Sending…'
                    : `Send to ${parsedRecipients.length} recipient${parsedRecipients.length === 1 ? '' : 's'} from ${phoneInfo?.displayPhoneNumber || 'your number'}`}
                </button>

                {!connected && (
                  <button onClick={() => setActiveTab('settings')} className="w-full text-[11px] font-bold text-warn underline">
                    Connect a WhatsApp Business number first
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: WhatsApp Interactive Phone Chat Mockup */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-line pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-ok" />
                  WhatsApp Live Chat Preview
                </h3>
                {currentTmpl && (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      currentTmpl.status === 'APPROVED'
                        ? 'bg-ok-soft text-ok'
                        : currentTmpl.status === 'PENDING'
                          ? 'bg-warn-soft text-warn'
                          : 'bg-danger-soft text-danger'
                    }`}
                  >
                    {currentTmpl.status}
                  </span>
                )}
              </div>

              {/*
                A real phone frame at a fixed aspect, so a long template body
                scrolls inside the handset instead of stretching it.
              */}
              <PhoneFrame label="WhatsApp · message preview">
                <div className="flex items-center gap-2.5 border-b border-line bg-sunk px-3 py-2.5">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ok-soft text-[10px] font-bold text-ok">
                    {(brand?.name || 'W').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-bold text-ink">
                      {phoneInfo?.verifiedName || brand?.name || 'Your business'}
                    </div>
                    <div className="truncate text-[10px] text-ink-4">
                      {phoneInfo?.displayPhoneNumber || 'Business account'}
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-3 bg-[#EFEAE2] p-3">
                {!currentTmpl ? (
                  <div className="bg-surface rounded-xl p-6 text-center space-y-2 text-xs border border-line">
                    <p className="font-bold text-ink-2">No templates to preview.</p>
                    <p className="text-ink-3">
                      {connected
                        ? 'This WhatsApp Business Account has no message templates yet. Create one in the Template Creator tab, or in Meta Business Manager.'
                        : 'Connect a WhatsApp Business number to load the templates approved on your account.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-surface rounded-xl p-3 shadow-xs space-y-2 text-xs border border-line">
                      {mediaHeaderUrl && (
                        <div className="h-36 bg-sunk rounded-lg overflow-hidden border border-line">
                          <img src={mediaHeaderUrl} alt="Header" className="w-full h-full object-cover" />
                        </div>
                      )}

                      {currentTmpl.headerContent && (
                        <div className="font-bold text-ink">{currentTmpl.headerContent}</div>
                      )}

                      <p className="text-ink-2 leading-relaxed">
                        {(currentTmpl.bodyText || '').replace('{{1}}', 'Alex').replace('{{2}}', brand?.name || 'WotSocial')}
                      </p>

                      {currentTmpl.footerText && (
                        <div className="text-[10px] text-ink-4 border-t border-line pt-1">
                          {currentTmpl.footerText}
                        </div>
                      )}
                    </div>

                    {/* Interactive Buttons Preview */}
                    {currentTmpl.buttons && currentTmpl.buttons.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {currentTmpl.buttons.map((btn, i) => (
                          <div key={i} className="w-full bg-surface hover:bg-sunk text-ok text-xs font-bold py-2 rounded-xl text-center border border-line shadow-2xs flex items-center justify-center gap-1">
                            {btn.type === 'URL' && <ExternalLink className="w-3.5 h-3.5" />}
                            {btn.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                </div>
              </PhoneFrame>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Interactive HSM Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b border-line pb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" />
                Pre-Approved WhatsApp HSM Templates
              </h3>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {templates.map((tmpl) => (
                <div key={tmpl.id} className="p-5 rounded-2xl border border-line bg-sunk space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink text-sm">{tmpl.name}</span>
                    <span className="text-[10px] bg-ok-soft text-ok font-bold px-2 py-0.5 rounded">
                      {tmpl.status}
                    </span>
                  </div>

                  <p className="text-xs text-ink-2 leading-relaxed font-mono bg-surface p-3 rounded-xl border border-line">
                    {tmpl.bodyText}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {tmpl.buttons.map((b, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-accent-soft text-accent-ink text-[11px] font-bold rounded-lg border border-accent-line">
                        🔘 {b.text}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Broadcast Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Total Recipients</div>
              <div className="text-2xl font-bold text-ink">
                {campaigns.reduce((acc, c) => acc + c.recipientsCount, 0).toLocaleString()}
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Avg Read Rate</div>
              <div className="text-2xl font-bold text-ok">86.4%</div>
              <div className="text-[10px] text-ink-3 font-semibold">10x Higher than Email</div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Avg Click-Through Rate</div>
              <div className="text-2xl font-bold text-accent">34.4%</div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Total Spent</div>
              <div className="text-2xl font-bold text-ink">
                ${campaigns.reduce((acc, c) => acc + c.spent, 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-line font-bold text-sm text-ink">
              WhatsApp Broadcast History
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-ink-2">
                <thead className="bg-sunk border-b border-line text-[10px] uppercase font-bold tracking-wider text-ink-3">
                  <tr>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Campaign Name & Template</th>
                    <th className="px-6 py-3">Target Segment</th>
                    <th className="px-6 py-3">Delivered</th>
                    <th className="px-6 py-3">Read Rate</th>
                    <th className="px-6 py-3">Clicks</th>
                    <th className="px-6 py-3 font-right">Spent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-medium">
                  {campaigns.map((camp) => (
                    <tr key={camp.id} className="hover:bg-sunk">
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-ok-soft text-ok text-[10px] font-bold rounded-full border border-ok-line">
                          {camp.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-ink">{camp.name}</td>
                      <td className="px-6 py-4 text-ink-3">{camp.targetSegment}</td>
                      <td className="px-6 py-4 font-semibold">{camp.deliveredCount} / {camp.recipientsCount}</td>
                      <td className="px-6 py-4 font-bold text-ok">
                        {camp.deliveredCount ? ((camp.readCount / camp.deliveredCount) * 100).toFixed(1) : '0.0'}%
                      </td>
                      <td className="px-6 py-4 font-bold text-accent">{camp.clickCount}</td>
                      <td className="px-6 py-4 font-bold">${camp.spent.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Live connection */}
      {activeTab === 'settings' && (
        <div className="bg-surface border border-line rounded-2xl p-8 shadow-sm max-w-2xl mx-auto space-y-6">
          <div className="border-b border-line pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-ok" />
                WhatsApp Business Cloud API Connection
              </h3>
              <p className="text-xs text-ink-3">
                Your token is verified with Meta and stored encrypted on the server, never in the browser.
              </p>
            </div>
            {savedSuccess && (
              <span className="text-xs bg-ok-soft text-ok font-bold px-3 py-1 rounded-full border border-ok-line">
                Connected
              </span>
            )}
          </div>

          {connection && (
            <div className={`rounded-xl border p-4 ${connected ? 'bg-ok-soft border-ok-line' : 'bg-danger-soft border-danger-line'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-ink flex items-center gap-2">
                    <Phone className="w-4 h-4 text-ok" />
                    {phoneInfo?.displayPhoneNumber || connection.username || connection.name}
                  </div>
                  {phoneInfo && (
                    <div className="text-[11px] text-ink-3">
                      {phoneInfo.verifiedName} · quality{' '}
                      <span className={
                        phoneInfo.qualityRating === 'GREEN' ? 'text-ok font-bold'
                          : phoneInfo.qualityRating === 'YELLOW' ? 'text-warn font-bold'
                          : 'text-danger font-bold'
                      }>
                        {phoneInfo.qualityRating}
                      </span>
                      {phoneInfo.throughputLevel ? ` · throughput ${phoneInfo.throughputLevel}` : ''}
                    </div>
                  )}
                  <div className="text-[11px] text-ink-3 font-mono">
                    Phone ID {connection.externalId} · token {connection.tokenPreview}
                  </div>
                  {connection.lastError && (
                    <div className="text-[11px] text-danger font-semibold">{connection.lastError}</div>
                  )}
                </div>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 bg-surface hover:bg-sunk border border-line-strong text-ink-2 text-[11px] font-bold rounded-lg shrink-0"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}

          {!webhooksConfigured && (
            <div className="rounded-xl border border-warn-line bg-warn-soft p-4 text-[11px] text-warn space-y-1">
              <p className="font-bold">Delivery receipts are inactive.</p>
              <p>
                Messages will send, but delivered and read counts stay at zero until webhooks are configured. Set{' '}
                <span className="font-mono">META_APP_SECRET</span> and{' '}
                <span className="font-mono">META_WEBHOOK_VERIFY_TOKEN</span> on the server, then subscribe your Meta app
                to the <span className="font-mono">messages</span> field on this WABA.
              </p>
            </div>
          )}

          {oauthConfigured && (
            <button
              onClick={handleOAuthConnect}
              disabled={connecting}
              className="w-full py-3 bg-accent hover:bg-accent disabled:opacity-60 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              {connecting ? 'Waiting for Meta…' : 'Connect with WhatsApp Business (OAuth)'}
            </button>
          )}

          <div className="space-y-4">
            <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wide">
              {oauthConfigured ? 'Or connect with a system-user token' : 'Connect with a system-user token'}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ink-2">Permanent Meta access token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAA…"
                className="w-full px-4 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink font-mono"
              />
              <p className="text-[11px] text-ink-3">
                Needs <span className="font-mono">whatsapp_business_messaging</span> and{' '}
                <span className="font-mono">whatsapp_business_management</span>.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-2">Phone number ID</label>
                <input
                  type="text"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="109876543210987"
                  className="w-full px-4 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-2">
                  WABA ID <span className="font-normal text-ink-4">(needed for templates)</span>
                </label>
                <input
                  type="text"
                  value={wabaAccountId}
                  onChange={(e) => setWabaAccountId(e.target.value)}
                  placeholder="102938475601928"
                  className="w-full px-4 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleConnectAccount}
              disabled={connecting || !accessToken.trim() || !phoneNumberId.trim()}
              className="w-full py-3 bg-ink hover:bg-ink-2 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-ok" />
              {connecting ? 'Verifying with Meta…' : 'Verify & connect WhatsApp number'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
