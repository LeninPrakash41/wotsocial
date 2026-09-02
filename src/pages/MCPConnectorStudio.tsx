import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getBrands, getBrandById, Brand, getMediaAssets, MediaAsset 
} from '../dbAdapter';
import { MCPLogEvent, MCP_SERVER_PATH } from '../services/mcpBridge';
import { mcpApi, describeError } from '../services/integrationsApi';
import { BrandSelector } from '../components/BrandSelector';
import { TabNav } from '../components/ui';
import { saveDraftMedia } from '../services/mediaStorage';
import { 
  Cpu, Sparkles, Copy, Check, Terminal, Folder, ShieldCheck, RefreshCw, 
  Play, ExternalLink, ArrowRight, Activity, Code, Layers, Image as ImageIcon,
  Key, Download, Bot, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';

export function MCPConnectorStudio() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'config' | 'gallery' | 'sandbox' | 'logs'>('config');

  // API Key State
  const [apiKey, setApiKey] = useState('');
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Ingested Media Assets
  const [ingestedAssets, setIngestedAssets] = useState<MediaAsset[]>([]);

  // Logs Feed
  const [logs, setLogs] = useState<MCPLogEvent[]>([]);

  // Sandbox Tester State
  const [selectedTool, setSelectedTool] = useState('wotsocial_list_brands');
  const [executing, setExecuting] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<any>(null);

  // Keys are issued by the server and stored only as hashes, so the raw value
  // exists in this page for exactly as long as the user needs to copy it.
  const [keyRecords, setKeyRecords] = useState<any[]>([]);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success' | 'info'; message: string } | null>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [sandboxArgs, setSandboxArgs] = useState('{}');
  const [serverUrl, setServerUrl] = useState('http://localhost:3050');

  const refreshLogs = async () => {
    try {
      const res = await mcpApi.logs();
      setLogs(res.logs as any);
    } catch {
      setLogs([]);
    }
  };

  const loadData = async (brandIdToLoad?: string) => {
    setLoading(true);
    try {
      const activeId = brandIdToLoad || localStorage.getItem('activeBrandId');
      let currentBrand: Brand | null = null;

      if (activeId) currentBrand = await getBrandById(activeId);
      if (!currentBrand) {
        const all = await getBrands();
        if (all.length > 0) currentBrand = all[0];
      }
      if (currentBrand) {
        setBrand(currentBrand);
        localStorage.setItem('activeBrandId', currentBrand.id);
      }

      setServerUrl(window.location.origin);

      const keys = await mcpApi.keys();
      setKeyRecords(keys.keys);
      const active = keys.keys.filter((k: any) => !k.revoked);
      if (!active.length) {
        setBanner({ kind: 'info', message: 'No MCP API key yet. Generate one below to connect Claude Desktop.' });
      }

      await refreshLogs();

      const allMedia = getMediaAssets();
      setIngestedAssets(allMedia);
    } catch (err) {
      setBanner({ kind: 'error', message: `Failed to load the MCP Studio: ${describeError(err)}` });
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

  /**
   * The config points Claude Desktop at the stdio bridge, which forwards every
   * tool call to this server. The absolute path matters — Claude Desktop runs
   * the command with no shell and no working directory of ours.
   */
  const buildConfigJson = (key: string) => JSON.stringify({
    mcpServers: {
      wotsocial: {
        command: 'node',
        args: [`${MCP_SERVER_PATH}`],
        env: {
          WOTSOCIAL_API_KEY: key || '<generate a key first>',
          WOTSOCIAL_API_ENDPOINT: `${serverUrl}/api/mcp`
        }
      }
    }
  }, null, 2);

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(buildConfigJson(apiKey));
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2500);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  /** Issues a server-side key. The raw value is returned exactly once. */
  const handleGenerateKey = async (revokeExisting: boolean) => {
    if (revokeExisting && !window.confirm(
      'Revoke every existing MCP key and issue a new one? Any Claude Desktop config using an old key will stop working.'
    )) return;

    try {
      const res = await mcpApi.issueKey('Claude Desktop', revokeExisting);
      setApiKey(res.key);
      const keys = await mcpApi.keys();
      setKeyRecords(keys.keys);
      setBanner({ kind: 'success', message: res.warning });

      // Load the live tool list using the key we just issued.
      try {
        const toolsRes = await fetch('/api/mcp/tools', { headers: { Authorization: `Bearer ${res.key}` } });
        if (toolsRes.ok) {
          const body = await toolsRes.json();
          setTools(body.tools || []);
          if (body.tools?.length) setSelectedTool(body.tools[0].name);
        }
      } catch { /* the catalogue is a convenience, not a requirement */ }
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  const handleRevokeAll = async () => {
    if (!window.confirm('Revoke all MCP API keys? Claude will lose access until you issue a new one.')) return;
    try {
      await mcpApi.revokeKeys();
      setApiKey('');
      const keys = await mcpApi.keys();
      setKeyRecords(keys.keys);
      setBanner({ kind: 'info', message: 'All MCP keys revoked.' });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  /**
   * Runs the tool through the exact endpoint and auth Claude uses, so what
   * happens here is what happens in Claude Desktop — not a simulation.
   */
  const handleRunSandboxTest = async () => {
    if (!apiKey) {
      setBanner({ kind: 'error', message: 'Generate an API key first — the playground authenticates the same way Claude does.' });
      return;
    }

    setExecuting(true);
    setSandboxResult(null);
    setBanner(null);

    let args: any;
    try {
      args = JSON.parse(sandboxArgs || '{}');
    } catch {
      setExecuting(false);
      setBanner({ kind: 'error', message: 'Arguments must be valid JSON.' });
      return;
    }
    if (!args.brand_name && brand) args.brand_name = brand.name;

    try {
      const res = await mcpApi.callTool(apiKey, selectedTool, args);
      setSandboxResult({ success: true, message: `${selectedTool} executed.`, data: res.result });
    } catch (err) {
      setSandboxResult({ success: false, message: describeError(err) });
    } finally {
      setExecuting(false);
      await refreshLogs();
      setIngestedAssets(getMediaAssets());
    }
  };

  if (loading) return <div className="p-8 font-sans text-ink-3 animate-pulse">Loading Claude MCP Connector Studio...</div>;

  const configJson = buildConfigJson(apiKey);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-accent px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Cpu className="w-3.5 h-3.5" />
              Anthropic Model Context Protocol (MCP) Standard
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Claude MCP Connector & Image Ingest Hub</h1>
          <p className="text-ink-3 mt-1">Connect Claude Desktop, Claude Web, or Cursor directly to WotSocial. Generate images inside Claude and automatically receive them here.</p>
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

          <div className="bg-ok-soft border border-ok-line px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold text-ok">
            <ShieldCheck className="w-4 h-4 text-ok" />
            <span>MCP Server Active (JSON-RPC stdio)</span>
          </div>
        </div>
      </header>

      {/* Main Tabs Navigation */}
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

      <TabNav
        tabs={[
          { id: 'config', label: 'Setup', icon: Terminal },
          { id: 'gallery', label: 'Received Media', icon: ImageIcon, count: ingestedAssets.length },
          { id: 'sandbox', label: 'Tool Tester', icon: Play },
          { id: 'logs', label: 'Keys & Activity', icon: Activity, count: logs.length }
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />


      {/* Tab 1: Claude Desktop Setup & Config Exporter */}
      {activeTab === 'config' && (
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-7 space-y-6">
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-line pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-accent" />
                    Claude Desktop `claude_desktop_config.json` Snippet
                  </h3>
                  <p className="text-xs text-ink-3">Copy this pre-configured JSON snippet and paste it into your Claude Desktop configuration file.</p>
                </div>
                <button
                  onClick={handleCopyConfig}
                  className="px-4 py-2 bg-ink hover:bg-ink-2 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {copiedConfig ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
                  {copiedConfig ? 'Config Copied!' : 'Copy Config JSON'}
                </button>
              </div>

              {/* Config JSON View */}
              <div className="relative">
                <pre className="p-4 bg-ink text-warn-line font-mono text-xs rounded-xl overflow-x-auto border border-ink-2 leading-relaxed">
                  {configJson}
                </pre>
              </div>

              <div className="bg-accent-soft border border-accent-line p-4 rounded-xl space-y-2">
                <div className="text-xs font-bold text-accent-ink flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-accent" /> How Claude MCP Integration Works:
                </div>
                <ul className="text-xs text-accent-ink space-y-1 list-disc list-inside font-medium">
                  <li>
                    Ask Claude: <span className="font-bold text-ink">"How are {brand?.name || 'my'} Meta ads performing this month?"</span> —
                    it calls <span className="font-mono text-ink font-bold">wotsocial_get_campaign_insights</span> and reads your live ad account.
                  </li>
                  <li>
                    Ask it to <span className="font-bold text-ink">draft and schedule a week of posts</span> — those land in your
                    content calendar through <span className="font-mono text-ink font-bold">wotsocial_create_post</span>.
                  </li>
                  <li>
                    Publishing and campaign tools act on the real platforms. Meta campaigns are always created paused, so Claude
                    can never start ad spend on its own.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: Setup Steps Instructions */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-ink border-b border-line pb-3 flex items-center gap-2">
                <Download className="w-5 h-5 text-accent" />
                Step-by-Step Installation Guide
              </h3>

              <div className="space-y-4 text-xs font-medium">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center font-bold shrink-0 text-xs">1</span>
                  <div>
                    <div className="font-bold text-ink">Open Claude Desktop Settings</div>
                    <p className="text-ink-3">Launch Claude Desktop app on Mac/PC and go to Settings &gt; Developer.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center font-bold shrink-0 text-xs">2</span>
                  <div>
                    <div className="font-bold text-ink">Edit Configuration File</div>
                    <p className="text-ink-3">Click "Edit Config" to open <span className="font-mono bg-sunk px-1 py-0.5 rounded text-ink-2">claude_desktop_config.json</span> in Finder.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center font-bold shrink-0 text-xs">3</span>
                  <div>
                    <div className="font-bold text-ink">Paste WotSocial MCP Snippet</div>
                    <p className="text-ink-3">Paste the JSON snippet on the left into your file and save it.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center font-bold shrink-0 text-xs">4</span>
                  <div>
                    <div className="font-bold text-ink">Restart Claude & Start Generating</div>
                    <p className="text-ink-3">Restart Claude Desktop. You will see WotSocial's hammer/tool icon ready!</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Ingested Claude Media Gallery */}
      {activeTab === 'gallery' && (
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b border-line pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-accent" />
                  Media Received & Ingested from Claude
                </h3>
                <p className="text-xs text-ink-3">Images and visual creative assets generated inside Claude conversations and automatically pushed into WotSocial.</p>
              </div>
              <span className="text-xs font-bold text-ink-3 bg-sunk px-3 py-1 rounded-full">
                {ingestedAssets.length} Ingested Items
              </span>
            </div>

            {ingestedAssets.length === 0 ? (
              <div className="p-12 text-center text-ink-3 text-xs space-y-2">
                <Bot className="w-8 h-8 mx-auto text-ink-4" />
                <p className="font-bold">No media saved from Claude yet.</p>
                <p>
                  Ask Claude to save an image with <span className="font-mono text-ink">wotsocial_save_media</span>, or try it in
                  the tool tester tab.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {ingestedAssets.map((asset) => (
                  <div key={asset.id} className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all space-y-2 flex flex-col justify-between group">
                    <div>
                      <div className="h-44 bg-ink overflow-hidden relative">
                        {asset.type === 'image' ? (
                          <img src={asset.url} alt={asset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <video src={asset.url} controls className="w-full h-full object-cover" />
                        )}
                        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-accent text-white px-2 py-0.5 rounded">
                          Claude MCP Ingest
                        </span>
                      </div>

                      <div className="p-3">
                        <div className="font-bold text-xs text-ink truncate" title={asset.title}>{asset.title}</div>
                        <div className="text-[10px] text-ink-4 mt-0.5">Received {format(new Date(asset.createdAt), 'MMM d, h:mm a')}</div>
                      </div>
                    </div>

                    <div className="p-3 border-t border-line bg-sunk flex items-center justify-between">
                      <button
                        onClick={async () => {
                          await saveDraftMedia(asset.url, asset.type);
                          navigate('/generate');
                        }}
                        className="w-full py-1.5 bg-ink hover:bg-ink-2 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-warn-line" /> Use in Content Studio
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Claude MCP Sandbox Tool Tester */}
      {activeTab === 'sandbox' && (
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-7 space-y-6">
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-line pb-3">
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Play className="w-5 h-5 text-ok" />
                  Claude MCP Tool Execution Sandbox
                </h3>
                <p className="text-xs text-ink-3">
                  Runs against the same endpoint and API key Claude Desktop uses — these calls are real and their
                  effects persist.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-ink-2">Tool</label>
                <select
                  value={selectedTool}
                  onChange={(e) => {
                    setSelectedTool(e.target.value);
                    const tool = tools.find((t: any) => t.name === e.target.value);
                    // Pre-fill the required arguments so the call is runnable.
                    const required: string[] = tool?.inputSchema?.required || [];
                    const seed: Record<string, any> = {};
                    for (const key of required) {
                      seed[key] = key === 'brand_name' ? (brand?.name || '') : '';
                    }
                    setSandboxArgs(JSON.stringify(seed, null, 2));
                    setSandboxResult(null);
                  }}
                  className="w-full px-3.5 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink bg-surface font-mono font-bold"
                >
                  {tools.length === 0 && <option value="">Generate an API key to load the tool list</option>}
                  {tools.map((t: any) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
                {tools.find((t: any) => t.name === selectedTool)?.description && (
                  <p className="text-[11px] text-ink-3 leading-relaxed">
                    {tools.find((t: any) => t.name === selectedTool).description}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-2">Arguments (JSON)</label>
                <textarea
                  value={sandboxArgs}
                  onChange={(e) => setSandboxArgs(e.target.value)}
                  rows={7}
                  spellCheck={false}
                  className="w-full px-3.5 py-2.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink font-mono leading-relaxed resize-y"
                />
                {(selectedTool === 'wotsocial_publish_instagram' ||
                  selectedTool === 'wotsocial_send_whatsapp' ||
                  selectedTool === 'wotsocial_launch_meta_campaign') && (
                  <p className="text-[11px] text-warn bg-warn-soft border border-warn-line rounded-lg px-3 py-2">
                    This tool acts on a live platform. Instagram posts publish immediately, WhatsApp messages are
                    delivered and billed, and Meta campaigns are created in your ad account (paused).
                  </p>
                )}
              </div>

              <button
                onClick={handleRunSandboxTest}
                disabled={executing}
                className="w-full py-3 bg-accent hover:bg-accent text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {executing ? <RefreshCw className="w-4 h-4 animate-spin text-warn-line" /> : <Play className="w-4 h-4" />}
                {executing ? 'Calling the tool…' : 'Run tool'}
              </button>
            </div>
          </div>

          {/* Right Column: Execution JSON Output Preview */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-ink border-b border-line pb-3 flex items-center gap-2">
                <Code className="w-5 h-5 text-accent" />
                Execution Response JSON Payload
              </h3>

              {sandboxResult ? (
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl text-xs font-bold border ${
                    sandboxResult.success ? 'bg-ok-soft text-ok border-ok-line' : 'bg-danger-soft text-danger border-danger-line'
                  }`}>
                    {sandboxResult.message}
                  </div>

                  <pre className="p-4 bg-ink text-ok font-mono text-xs rounded-xl overflow-x-auto border border-ink-2 leading-relaxed max-h-80">
                    {JSON.stringify(sandboxResult, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-ink-4">
                  Run a tool to see the exact JSON Claude would receive.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: API Keys & Live Log Stream */}
      {activeTab === 'logs' && (
        <div className="space-y-6">
          {/* API Key Card */}
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b border-line pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Key className="w-5 h-5 text-warn" />
                  WotSocial MCP Secret API Key
                </h3>
                <p className="text-xs text-ink-3">
                  Authenticates Claude's requests to this workspace. Only a hash is stored — the key is shown once,
                  when it is issued.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleGenerateKey(false)}
                  className="px-3.5 py-1.5 bg-ink hover:bg-ink-2 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Generate key
                </button>
                {keyRecords.some((k: any) => !k.revoked) && (
                  <button
                    onClick={handleRevokeAll}
                    className="px-3.5 py-1.5 bg-sunk hover:bg-danger-soft hover:text-danger text-ink-2 text-xs font-bold rounded-xl transition-all"
                  >
                    Revoke all
                  </button>
                )}
              </div>
            </div>

            {apiKey ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    readOnly
                    value={apiKey}
                    className="w-full px-4 py-2.5 text-xs border border-warn-line rounded-xl outline-none bg-warn-soft font-mono font-bold text-ink"
                  />
                  <button
                    onClick={handleCopyKey}
                    className="px-4 py-2.5 bg-ink hover:bg-ink-2 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
                    {copiedKey ? 'Copied' : 'Copy key'}
                  </button>
                </div>
                <p className="text-[11px] text-warn font-semibold">
                  Copy this now — it cannot be shown again. Reload the page and it is gone.
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink-3 py-3">
                No key in this session. Generate one to connect Claude Desktop, or revoke and reissue if you have lost it.
              </p>
            )}

            {keyRecords.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-line">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4">Issued keys</div>
                {keyRecords.map((k: any) => (
                  <div key={k.id} className="flex items-center justify-between text-[11px] py-1">
                    <span className="font-mono text-ink-2">{k.prefix}…</span>
                    <span className="text-ink-3">
                      {k.label} · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : 'never used'}
                    </span>
                    <span className={`font-bold ${k.revoked ? 'text-danger' : 'text-ok'}`}>
                      {k.revoked ? 'REVOKED' : 'ACTIVE'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Log Stream Table */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-line font-bold text-sm text-ink flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-accent" />
                Claude Incoming MCP Tool Activity Feed
              </div>
              <span className="text-xs text-ink-3 font-semibold">{logs.length} Log Entries</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-ink-2">
                <thead className="bg-sunk border-b border-line text-[10px] uppercase font-bold tracking-wider text-ink-3">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">MCP Tool Name</th>
                    <th className="px-6 py-3">Brand Target</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-medium">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-ink-4">
                        No MCP tool calls yet. Every call Claude makes is recorded here.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-sunk">
                        <td className="px-6 py-4 text-ink-3 font-mono text-[11px]">
                          {format(new Date(log.timestamp), 'MMM d, h:mm:ss a')}
                        </td>
                        <td className="px-6 py-4 font-bold text-accent-ink font-mono">{log.toolName}</td>
                        <td className="px-6 py-4 font-bold text-ink">{log.brandName}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                              log.status === 'SUCCESS'
                                ? 'bg-ok-soft text-ok border-ok-line'
                                : 'bg-danger-soft text-danger border-danger-line'
                            }`}
                          >
                            {log.status}
                          </span>
                          {typeof log.durationMs === 'number' && (
                            <span className="ml-2 text-[10px] text-ink-4 font-mono">{log.durationMs}ms</span>
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          {log.error ? (
                            <span className="text-danger text-[11px] break-words">{log.error}</span>
                          ) : (
                            <span className="text-ink-3 text-[11px] font-mono break-words line-clamp-2">
                              {log.result ? JSON.stringify(log.result).slice(0, 120) : '—'}
                            </span>
                          )}
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
    </div>
  );
}
