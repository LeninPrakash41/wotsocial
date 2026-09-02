import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getBrands, getBrandById, getWhatsAppAccount, saveWhatsAppAccount, 
  getWhatsAppCampaigns, saveWhatsAppCampaign, Brand, WhatsAppAccount, 
  WhatsAppCampaign, WhatsAppTemplate, getMediaAssets, MediaAsset
} from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
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
  const [waAccount, setWaAccount] = useState<WhatsAppAccount | null>(null);
  const [wabaAccountId, setWabaAccountId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Broadcast Builder State
  const [campaignName, setCampaignName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('PROMO_OFFER_V1');
  const [targetSegment, setTargetSegment] = useState('VIP Customers (1,250 Contacts)');
  const [mediaHeaderUrl, setMediaHeaderUrl] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Templates State
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([
    {
      id: 'tmpl_1',
      name: 'PROMO_OFFER_V1',
      category: 'MARKETING',
      language: 'en_US',
      headerType: 'IMAGE',
      bodyText: 'Hi {{1}}! 🔥 Exclusive offer for {{2}} customers. Get 25% OFF your next upgrade with coupon code: WOT25.',
      footerText: 'Reply STOP to unsubscribe.',
      buttons: [
        { type: 'URL', text: 'Claim Discount', value: 'https://wotsocial.app/claim' },
        { type: 'QUICK_REPLY', text: 'Talk to Sales' }
      ],
      status: 'APPROVED'
    },
    {
      id: 'tmpl_2',
      name: 'NEW_FEATURE_ANNOUNCEMENT',
      category: 'MARKETING',
      language: 'en_US',
      headerType: 'TEXT',
      headerContent: '🚀 Major Platform Update',
      bodyText: 'Hi {{1}}! We just launched WhatsApp & Instagram marketing in WotSocial. Automate your campaigns today.',
      footerText: 'WotSocial Team',
      buttons: [
        { type: 'URL', text: 'Try New Feature', value: 'https://wotsocial.app/whatsapp' }
      ],
      status: 'APPROVED'
    }
  ]);

  // Campaigns State
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);

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

        // Load WhatsApp Account
        const acc = getWhatsAppAccount(currentBrand.id);
        if (acc) {
          setWaAccount(acc);
          setWabaAccountId(acc.wabaAccountId);
          setPhoneNumberId(acc.phoneNumberId);
          setPhoneNumber(acc.phoneNumber);
          setAccessToken(acc.accessToken);
        } else {
          const defaultAcc: WhatsAppAccount = {
            id: 'wa_acc_' + currentBrand.id,
            brandId: currentBrand.id,
            wabaAccountId: 'waba_' + Math.floor(10000000 + Math.random() * 90000000),
            phoneNumberId: 'phone_id_' + Math.floor(100000 + Math.random() * 900000),
            phoneNumber: '+1 (800) 555-0199',
            accessToken: 'EAAB...' + Math.random().toString(36).substr(2, 10),
            qualityRating: 'GREEN',
            status: 'CONNECTED'
          };
          saveWhatsAppAccount(defaultAcc);
          setWaAccount(defaultAcc);
          setWabaAccountId(defaultAcc.wabaAccountId);
          setPhoneNumberId(defaultAcc.phoneNumberId);
          setPhoneNumber(defaultAcc.phoneNumber);
          setAccessToken(defaultAcc.accessToken);
        }

        // Load Campaigns
        const camps = getWhatsAppCampaigns(currentBrand.id);
        if (camps.length === 0) {
          const seedCamp: WhatsAppCampaign = {
            id: 'wa_camp_seed_1',
            brandId: currentBrand.id,
            name: `${currentBrand.name} - Q3 Product Promotion`,
            templateName: 'PROMO_OFFER_V1',
            targetSegment: 'VIP Customers (1,250 Contacts)',
            recipientsCount: 1250,
            deliveredCount: 1242,
            readCount: 1080,
            clickCount: 430,
            status: 'COMPLETED',
            spent: 18.75,
            createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
          };
          saveWhatsAppCampaign(seedCamp);
          setCampaigns([seedCamp]);
        } else {
          setCampaigns(camps);
        }

        // Load Media Assets
        const assets = getMediaAssets().filter(a => !a.brandId || a.brandId === currentBrand?.id);
        setMediaAssets(assets);
        if (assets.length > 0) {
          setMediaHeaderUrl(assets[0].url);
        }
      }
    } catch (err) {
      console.error("Error loading WhatsApp Studio:", err);
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

  const handleSaveAccount = () => {
    if (!brand) return;
    const acc: WhatsAppAccount = {
      id: waAccount?.id || 'wa_acc_' + brand.id,
      brandId: brand.id,
      wabaAccountId: wabaAccountId || 'waba_987654321',
      phoneNumberId: phoneNumberId || 'phone_id_123456',
      phoneNumber: phoneNumber || '+1 (800) 555-0199',
      accessToken: accessToken || 'WA_TOKEN_SANDBOX',
      qualityRating: 'GREEN',
      status: 'CONNECTED'
    };
    saveWhatsAppAccount(acc);
    setWaAccount(acc);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handlePublishBroadcast = () => {
    if (!campaignName.trim() || !brand) return;
    setPublishing(true);

    setTimeout(() => {
      const count = targetSegment.includes('1,250') ? 1250 : targetSegment.includes('450') ? 450 : 800;
      const newCamp: WhatsAppCampaign = {
        id: 'wa_camp_' + Date.now(),
        brandId: brand.id,
        name: campaignName,
        templateName: selectedTemplate,
        targetSegment,
        recipientsCount: count,
        deliveredCount: Math.floor(count * 0.98),
        readCount: Math.floor(count * 0.85),
        clickCount: Math.floor(count * 0.35),
        status: 'ACTIVE',
        spent: Number((count * 0.015).toFixed(2)),
        createdAt: new Date().toISOString()
      };

      saveWhatsAppCampaign(newCamp);
      setCampaigns([newCamp, ...campaigns]);
      setPublishing(false);
      setActiveTab('analytics');
    }, 1500);
  };

  if (loading) return <div className="p-8 font-sans text-gray-500 animate-pulse">Loading WhatsApp Business Studio...</div>;

  const currentTmpl = templates.find(t => t.name === selectedTemplate) || templates[0];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <MessageSquare className="w-3.5 h-3.5" />
              WhatsApp Business Cloud API (WABA)
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">WhatsApp Business Broadcast & HSM Studio</h1>
          <p className="text-gray-500 mt-1">Send targeted marketing broadcasts, design pre-approved HSM templates with interactive buttons, and capture high-converting messaging analytics.</p>
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

          <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <Phone className="w-4 h-4 text-emerald-600" />
            <span>{waAccount?.phoneNumber || '+1 (800) 555-0199'}</span>
            <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">HIGH QUALITY</span>
          </div>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap bg-gray-100 p-1.5 rounded-2xl border border-gray-200 gap-1">
        <button
          onClick={() => setActiveTab('broadcast')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'broadcast' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Send className="w-4 h-4 text-emerald-400" />
          1. Broadcast Campaign Builder
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'templates' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4 text-blue-400" />
          2. Interactive HSM Template Creator ({templates.length})
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'analytics' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-purple-400" />
          3. Broadcast Delivery & Read Analytics
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'settings' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Settings className="w-4 h-4 text-amber-400" />
          4. WABA Account API Settings
        </button>
      </div>

      {/* Tab 1: Broadcast Campaign Builder */}
      {activeTab === 'broadcast' && (
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-7 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Send className="w-5 h-5 text-emerald-600" />
                  Launch New WhatsApp Broadcast Campaign
                </h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Broadcast Campaign Name</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. VIP Customers - Q3 Flash Discount Alert"
                    className="w-full px-3.5 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700">Select HSM Message Template</label>
                    <select
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white font-bold"
                    >
                      {templates.map(t => (
                        <option key={t.id} value={t.name}>{t.name} ({t.category})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700">Target Contact Segment</label>
                    <select
                      value={targetSegment}
                      onChange={(e) => setTargetSegment(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black bg-white"
                    >
                      <option value="VIP Customers (1,250 Contacts)">VIP Customers (1,250 Contacts)</option>
                      <option value="Lead Trial Signups (450 Contacts)">Lead Trial Signups (450 Contacts)</option>
                      <option value="Re-engagement List (800 Contacts)">Re-engagement List (800 Contacts)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Header Attachment URL (Optional)</label>
                  <input
                    type="text"
                    value={mediaHeaderUrl}
                    onChange={(e) => setMediaHeaderUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              <button
                onClick={handlePublishBroadcast}
                disabled={publishing || !campaignName.trim()}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {publishing ? <RefreshCw className="w-4 h-4 animate-spin text-amber-300" /> : <Send className="w-4 h-4 text-emerald-300" />}
                {publishing ? 'Dispatching WhatsApp Broadcast...' : 'Dispatch WhatsApp Broadcast Now'}
              </button>
            </div>
          </div>

          {/* Right Column: WhatsApp Interactive Phone Chat Mockup */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-600" />
                  WhatsApp Live Chat Preview
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  98.4% READ RATE
                </span>
              </div>

              {/* Chat Bubble Mockup */}
              <div className="bg-[#efeae2] rounded-2xl p-4 border border-gray-200 shadow-inner max-w-sm mx-auto space-y-3 min-h-[320px]">
                <div className="bg-white rounded-xl p-3 shadow-xs space-y-2 text-xs border border-gray-100">
                  {mediaHeaderUrl && (
                    <div className="h-36 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                      <img src={mediaHeaderUrl} alt="Header" className="w-full h-full object-cover" />
                    </div>
                  )}

                  {currentTmpl.headerContent && (
                    <div className="font-bold text-gray-900">{currentTmpl.headerContent}</div>
                  )}

                  <p className="text-gray-800 leading-relaxed">
                    {currentTmpl.bodyText.replace('{{1}}', 'Alex').replace('{{2}}', brand?.name || 'WotSocial')}
                  </p>

                  {currentTmpl.footerText && (
                    <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-1">
                      {currentTmpl.footerText}
                    </div>
                  )}
                </div>

                {/* Interactive Buttons Preview */}
                {currentTmpl.buttons && currentTmpl.buttons.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {currentTmpl.buttons.map((btn, i) => (
                      <div key={i} className="w-full bg-white hover:bg-gray-50 text-emerald-600 text-xs font-bold py-2 rounded-xl text-center border border-gray-200 shadow-2xs flex items-center justify-center gap-1">
                        {btn.type === 'URL' && <ExternalLink className="w-3.5 h-3.5" />}
                        {btn.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Interactive HSM Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Pre-Approved WhatsApp HSM Templates
              </h3>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {templates.map((tmpl) => (
                <div key={tmpl.id} className="p-5 rounded-2xl border border-gray-200 bg-gray-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-sm">{tmpl.name}</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                      {tmpl.status}
                    </span>
                  </div>

                  <p className="text-xs text-gray-700 leading-relaxed font-mono bg-white p-3 rounded-xl border border-gray-200">
                    {tmpl.bodyText}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {tmpl.buttons.map((b, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-blue-50 text-blue-800 text-[11px] font-bold rounded-lg border border-blue-200">
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
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Recipients</div>
              <div className="text-2xl font-bold text-gray-900">
                {campaigns.reduce((acc, c) => acc + c.recipientsCount, 0).toLocaleString()}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Avg Read Rate</div>
              <div className="text-2xl font-bold text-emerald-600">86.4%</div>
              <div className="text-[10px] text-gray-500 font-semibold">10x Higher than Email</div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Avg Click-Through Rate</div>
              <div className="text-2xl font-bold text-purple-600">34.4%</div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Spent</div>
              <div className="text-2xl font-bold text-gray-900">
                ${campaigns.reduce((acc, c) => acc + c.spent, 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-gray-100 font-bold text-sm text-gray-900">
              WhatsApp Broadcast History
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-800">
                <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold tracking-wider text-gray-500">
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
                <tbody className="divide-y divide-gray-100 font-medium">
                  {campaigns.map((camp) => (
                    <tr key={camp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full border border-emerald-200">
                          {camp.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">{camp.name}</td>
                      <td className="px-6 py-4 text-gray-600">{camp.targetSegment}</td>
                      <td className="px-6 py-4 font-semibold">{camp.deliveredCount} / {camp.recipientsCount}</td>
                      <td className="px-6 py-4 font-bold text-emerald-600">
                        {((camp.readCount / camp.deliveredCount) * 100).toFixed(1)}%
                      </td>
                      <td className="px-6 py-4 font-bold text-purple-600">{camp.clickCount}</td>
                      <td className="px-6 py-4 font-bold">${camp.spent.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: API Settings */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm max-w-2xl mx-auto space-y-6">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                WhatsApp Business Cloud API Connection
              </h3>
              <p className="text-xs text-gray-500">Connect your WhatsApp Business Account ID (WABA) and Phone Number ID.</p>
            </div>
            {savedSuccess && (
              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-200">
                Saved!
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">WhatsApp Business Phone Number</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (800) 555-0199"
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">WABA Account ID</label>
              <input
                type="text"
                value={wabaAccountId}
                onChange={(e) => setWabaAccountId(e.target.value)}
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Phone Number ID</label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Permanent Meta Access Token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black font-mono"
              />
            </div>

            <button
              onClick={handleSaveAccount}
              className="w-full py-3 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Save WABA Connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
