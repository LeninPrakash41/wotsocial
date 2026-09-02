import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getBrands, getBrandById, Brand, getMediaAssets, MediaAsset 
} from '../dbAdapter';
import { 
  getMCPLogs, getMCPAPIKey, generateNewMCPAPIKey, executeMCPToolCall, 
  receiveImageFromClaude, getClaudeDesktopConfigJSON, MCPLogEvent 
} from '../services/mcpBridge';
import { BrandSelector } from '../components/BrandSelector';
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
  const [selectedTool, setSelectedTool] = useState('wotsocial_generate_image');
  const [sandboxPrompt, setSandboxPrompt] = useState('A modern minimalist isometric 3D logo graphic for AI automation platform');
  const [sandboxTitle, setSandboxTitle] = useState('Claude AI Generated Brand Artwork');
  const [sandboxImageUrl, setSandboxImageUrl] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=80');
  const [executing, setExecuting] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<any>(null);

  const loadData = async (brandIdToLoad?: string) => {
    setLoading(true);
    try {
      const activeId = brandIdToLoad || localStorage.getItem('activeBrandId');
      let currentBrand: Brand | null = null;

      if (activeId) {
        currentBrand = await getBrandById(activeId);
      }
      if (!currentBrand) {
        const all = await getBrands();
        if (all.length > 0) currentBrand = all[0];
      }

      if (currentBrand) {
        setBrand(currentBrand);
        localStorage.setItem('activeBrandId', currentBrand.id);
      }

      setApiKey(getMCPAPIKey());
      setLogs(getMCPLogs());

      // Filter Ingested Claude Media Assets
      const allMedia = getMediaAssets();
      const claudeAssets = allMedia.filter(m => m.source === 'ai-generated' || m.title.toLowerCase().includes('claude'));
      setIngestedAssets(claudeAssets.length > 0 ? claudeAssets : allMedia);
    } catch (err) {
      console.error("Error loading MCP Studio:", err);
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

  const handleCopyConfig = () => {
    const json = getClaudeDesktopConfigJSON(apiKey);
    navigator.clipboard.writeText(json);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2500);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleRegenerateKey = () => {
    if (!window.confirm("Regenerate MCP API Key? Previous Claude connections will need to update their config.")) return;
    const newKey = generateNewMCPAPIKey();
    setApiKey(newKey);
  };

  const handleRunSandboxTest = async () => {
    setExecuting(true);
    setSandboxResult(null);

    const args: any = {
      brand_name: brand?.name || 'Active Brand'
    };

    if (selectedTool === 'wotsocial_generate_image') {
      args.prompt = sandboxPrompt;
    } else if (selectedTool === 'wotsocial_receive_image') {
      args.title = sandboxTitle;
      args.image_url = sandboxImageUrl;
      args.media_type = 'image';
    } else if (selectedTool === 'wotsocial_publish_post') {
      args.content = `🚀 Post generated via Claude MCP Connector for ${brand?.name || 'Active Brand'}!`;
    }

    const res = await executeMCPToolCall(selectedTool, args);
    setSandboxResult(res);
    setExecuting(false);
    setLogs(getMCPLogs());

    // Refresh Media Assets if image generated
    if (selectedTool === 'wotsocial_generate_image' || selectedTool === 'wotsocial_receive_image') {
      const allMedia = getMediaAssets();
      setIngestedAssets(allMedia);
    }
  };

  if (loading) return <div className="p-8 font-sans text-gray-500 animate-pulse">Loading Claude MCP Connector Studio...</div>;

  const configJson = getClaudeDesktopConfigJSON(apiKey);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-orange-600 to-amber-600 px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Cpu className="w-3.5 h-3.5" />
              Anthropic Model Context Protocol (MCP) Standard
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Claude MCP Connector & Image Ingest Hub</h1>
          <p className="text-gray-500 mt-1">Connect Claude Desktop, Claude Web, or Cursor directly to WotSocial. Generate images inside Claude and automatically receive them here.</p>
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

          <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>MCP Server Active (JSON-RPC stdio)</span>
          </div>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap bg-gray-100 p-1.5 rounded-2xl border border-gray-200 gap-1">
        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'config' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Code className="w-4 h-4 text-amber-400" />
          1. Claude Desktop Setup & Config Exporter
        </button>

        <button
          onClick={() => setActiveTab('gallery')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'gallery' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ImageIcon className="w-4 h-4 text-blue-400" />
          2. Ingested Claude Media Vault ({ingestedAssets.length})
        </button>

        <button
          onClick={() => setActiveTab('sandbox')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'sandbox' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Play className="w-4 h-4 text-emerald-400" />
          3. Claude MCP Sandbox Tool Tester
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'logs' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Activity className="w-4 h-4 text-purple-400" />
          4. MCP API Keys & Log Stream ({logs.length})
        </button>
      </div>

      {/* Tab 1: Claude Desktop Setup & Config Exporter */}
      {activeTab === 'config' && (
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-7 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-orange-600" />
                    Claude Desktop `claude_desktop_config.json` Snippet
                  </h3>
                  <p className="text-xs text-gray-500">Copy this pre-configured JSON snippet and paste it into your Claude Desktop configuration file.</p>
                </div>
                <button
                  onClick={handleCopyConfig}
                  className="px-4 py-2 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {copiedConfig ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copiedConfig ? 'Config Copied!' : 'Copy Config JSON'}
                </button>
              </div>

              {/* Config JSON View */}
              <div className="relative">
                <pre className="p-4 bg-gray-900 text-amber-300 font-mono text-xs rounded-xl overflow-x-auto border border-gray-800 leading-relaxed">
                  {configJson}
                </pre>
              </div>

              <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl space-y-2">
                <div className="text-xs font-bold text-orange-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-orange-600" /> How Claude MCP Integration Works:
                </div>
                <ul className="text-xs text-orange-800 space-y-1 list-disc list-inside font-medium">
                  <li>In Claude Desktop, ask: <span className="font-bold text-gray-900">"Generate a high-res SaaS hero image for {brand?.name}"</span>.</li>
                  <li>Claude automatically invokes <span className="font-mono text-black font-bold">wotsocial_generate_image</span> via MCP.</li>
                  <li>The generated graphic is pushed directly into WotSocial's Digital Media Vault & Scheduler.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: Setup Steps Instructions */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-600" />
                Step-by-Step Installation Guide
              </h3>

              <div className="space-y-4 text-xs font-medium">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold shrink-0 text-xs">1</span>
                  <div>
                    <div className="font-bold text-gray-900">Open Claude Desktop Settings</div>
                    <p className="text-gray-500">Launch Claude Desktop app on Mac/PC and go to Settings &gt; Developer.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold shrink-0 text-xs">2</span>
                  <div>
                    <div className="font-bold text-gray-900">Edit Configuration File</div>
                    <p className="text-gray-500">Click "Edit Config" to open <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-800">claude_desktop_config.json</span> in Finder.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold shrink-0 text-xs">3</span>
                  <div>
                    <div className="font-bold text-gray-900">Paste WotSocial MCP Snippet</div>
                    <p className="text-gray-500">Paste the JSON snippet on the left into your file and save it.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold shrink-0 text-xs">4</span>
                  <div>
                    <div className="font-bold text-gray-900">Restart Claude & Start Generating</div>
                    <p className="text-gray-500">Restart Claude Desktop. You will see WotSocial's hammer/tool icon ready!</p>
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
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-blue-600" />
                  Media Received & Ingested from Claude
                </h3>
                <p className="text-xs text-gray-500">Images and visual creative assets generated inside Claude conversations and automatically pushed into WotSocial.</p>
              </div>
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                {ingestedAssets.length} Ingested Items
              </span>
            </div>

            {ingestedAssets.length === 0 ? (
              <div className="p-12 text-center text-gray-500 text-xs space-y-2">
                <Bot className="w-8 h-8 mx-auto text-gray-400" />
                <p className="font-bold">No images received from Claude yet.</p>
                <p>Run <span className="font-mono text-black">wotsocial_generate_image</span> inside Claude Desktop or test it in Tab 3 Sandbox.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {ingestedAssets.map((asset) => (
                  <div key={asset.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all space-y-2 flex flex-col justify-between group">
                    <div>
                      <div className="h-44 bg-gray-900 overflow-hidden relative">
                        {asset.type === 'image' ? (
                          <img src={asset.url} alt={asset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <video src={asset.url} controls className="w-full h-full object-cover" />
                        )}
                        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-orange-600 text-white px-2 py-0.5 rounded">
                          Claude MCP Ingest
                        </span>
                      </div>

                      <div className="p-3">
                        <div className="font-bold text-xs text-gray-900 truncate" title={asset.title}>{asset.title}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Received {format(new Date(asset.createdAt), 'MMM d, h:mm a')}</div>
                      </div>
                    </div>

                    <div className="p-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                      <button
                        onClick={async () => {
                          await saveDraftMedia(asset.url, asset.type);
                          navigate('/generate');
                        }}
                        className="w-full py-1.5 bg-black hover:bg-gray-800 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Use in Content Studio
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
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Play className="w-5 h-5 text-emerald-600" />
                  Claude MCP Tool Execution Sandbox
                </h3>
                <p className="text-xs text-gray-500">Simulate how Claude invokes WotSocial tools in real time.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">Select MCP Tool to Execute</label>
                <select
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white font-mono font-bold"
                >
                  <option value="wotsocial_generate_image">wotsocial_generate_image (Generate & Push to Media Vault)</option>
                  <option value="wotsocial_receive_image">wotsocial_receive_image (Ingest External Image URL)</option>
                  <option value="wotsocial_get_brand_strategy">wotsocial_get_brand_strategy (Fetch Strategy Blueprint)</option>
                  <option value="wotsocial_list_brands">wotsocial_list_brands (List Customer Brands)</option>
                  <option value="wotsocial_publish_post">wotsocial_publish_post (Draft Post to Calendar)</option>
                </select>
              </div>

              {selectedTool === 'wotsocial_generate_image' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Prompt Parameter</label>
                  <textarea
                    value={sandboxPrompt}
                    onChange={(e) => setSandboxPrompt(e.target.value)}
                    rows={3}
                    className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black leading-relaxed"
                  />
                </div>
              )}

              {selectedTool === 'wotsocial_receive_image' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Image Title</label>
                    <input
                      type="text"
                      value={sandboxTitle}
                      onChange={(e) => setSandboxTitle(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">Image URL</label>
                    <input
                      type="text"
                      value={sandboxImageUrl}
                      onChange={(e) => setSandboxImageUrl(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleRunSandboxTest}
                disabled={executing}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {executing ? <RefreshCw className="w-4 h-4 animate-spin text-amber-300" /> : <Play className="w-4 h-4" />}
                {executing ? 'Executing MCP Tool Request...' : 'Run MCP Tool Sandbox Execution'}
              </button>
            </div>
          </div>

          {/* Right Column: Execution JSON Output Preview */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-600" />
                Execution Response JSON Payload
              </h3>

              {sandboxResult ? (
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl text-xs font-bold border ${
                    sandboxResult.success ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-900 border-red-200'
                  }`}>
                    {sandboxResult.message}
                  </div>

                  <pre className="p-4 bg-gray-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto border border-gray-800 leading-relaxed max-h-80">
                    {JSON.stringify(sandboxResult, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-gray-400">
                  Click "Run MCP Tool Sandbox Execution" to view JSON-RPC response.
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
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-500" />
                  WotSocial MCP Secret API Key
                </h3>
                <p className="text-xs text-gray-500">Your unique secret key authenticating Claude MCP requests.</p>
              </div>

              <button
                onClick={handleRegenerateKey}
                className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition-all"
              >
                Regenerate Key
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                readOnly
                value={apiKey}
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none bg-gray-50 font-mono font-bold text-gray-800"
              />
              <button
                onClick={handleCopyKey}
                className="px-4 py-2.5 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0"
              >
                {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedKey ? 'Copied' : 'Copy Key'}
              </button>
            </div>
          </div>

          {/* Live Log Stream Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-gray-100 font-bold text-sm text-gray-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-600" />
                Claude Incoming MCP Tool Activity Feed
              </div>
              <span className="text-xs text-gray-500 font-semibold">{logs.length} Log Entries</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-800">
                <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold tracking-wider text-gray-500">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">MCP Tool Name</th>
                    <th className="px-6 py-3">Brand Target</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Ingested Asset</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                        No MCP tool calls logged yet. Run a test in Tab 3 Sandbox!
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-500 font-mono text-[11px]">
                          {format(new Date(log.timestamp), 'MMM d, h:mm:ss a')}
                        </td>
                        <td className="px-6 py-4 font-bold text-purple-700 font-mono">{log.toolName}</td>
                        <td className="px-6 py-4 font-bold text-gray-900">{log.brandName}</td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full border border-emerald-200">
                            {log.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {log.generatedAssetUrl ? (
                            <a href={log.generatedAssetUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                              View Graphic <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-gray-400">N/A</span>
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
