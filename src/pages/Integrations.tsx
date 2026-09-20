import { useState, useEffect } from 'react';
import { Save, Key, Shield, AlertCircle, Share2, Instagram, Facebook, Twitter, Linkedin } from 'lucide-react';
import { ContentConnections } from '../components/ContentConnections';

export function Integrations() {
  const [geminiKey, setGeminiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [openartKey, setOpenartKey] = useState('');
  const [seedanceKey, setSeedanceKey] = useState('');
  const [twitterApiKey, setTwitterApiKey] = useState('');
  const [twitterApiSecret, setTwitterApiSecret] = useState('');
  const [linkedinToken, setLinkedinToken] = useState('');
  const [facebookToken, setFacebookToken] = useState('');
  const [instagramToken, setInstagramToken] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem('gemini_api_key');
    if (key) setGeminiKey(key);

    const cKey = localStorage.getItem('claude_api_key');
    if (cKey) setClaudeKey(cKey);

    const oaKey = localStorage.getItem('openart_api_key');
    if (oaKey) setOpenartKey(oaKey);

    const sdKey = localStorage.getItem('seedance_api_key');
    if (sdKey) setSeedanceKey(sdKey);

    const twKey = localStorage.getItem('twitter_api_key');
    if (twKey) setTwitterApiKey(twKey);

    const twSecret = localStorage.getItem('twitter_api_secret');
    if (twSecret) setTwitterApiSecret(twSecret);

    const liToken = localStorage.getItem('linkedin_access_token');
    if (liToken) setLinkedinToken(liToken);

    const fbToken = localStorage.getItem('facebook_access_token');
    if (fbToken) setFacebookToken(fbToken);

    const igToken = localStorage.getItem('instagram_access_token');
    if (igToken) setInstagramToken(igToken);
  }, []);

  const handleSave = () => {
    const saveItem = (key: string, value: string) => {
      if (value) {
        localStorage.setItem(key, value.trim());
      } else {
        localStorage.removeItem(key);
      }
    }

    saveItem('gemini_api_key', geminiKey);
    saveItem('claude_api_key', claudeKey);
    saveItem('openart_api_key', openartKey);
    saveItem('seedance_api_key', seedanceKey);
    saveItem('twitter_api_key', twitterApiKey);
    saveItem('twitter_api_secret', twitterApiSecret);
    saveItem('linkedin_access_token', linkedinToken);
    saveItem('facebook_access_token', facebookToken);
    saveItem('instagram_access_token', instagramToken);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Integrations</h1>
        <p className="text-ink-3 mt-1">Connect the models, platforms and content sources this workspace uses.</p>
      </header>

      <div className="bg-surface border text-ink-2 border-line rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-accent-soft text-accent rounded-xl">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Where your credentials live</h2>
            <p className="text-ink-3 text-sm mt-1">
              The AI keys below stay in this browser and are sent straight to Gemini or Claude — they never reach our
              server. Platform credentials are different: Meta, WordPress and Shopify have to be used server-side, so
              those are encrypted at rest and only a masked preview is ever shown back to you.
            </p>
          </div>
        </div>
      </div>

      {/* AI Key */}
      <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <Key className="w-5 h-5 text-ink-4" />
          <h2 className="text-lg font-semibold text-ink">AI Generation & Analytics</h2>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2 max-w-2xl">
            <label className="text-sm font-medium text-ink-2">Gemini API Key</label>
            <input 
              type="password" 
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent outline-none transition-all"
              placeholder="AIzaSy..."
            />
            <p className="text-xs text-ink-3 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              Required for Gemini AI content generation, search, and video features. Get key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Google AI Studio</a>.
            </p>
          </div>

          <div className="space-y-2 max-w-2xl pt-4 border-t border-line">
            <label className="text-sm font-medium text-ink-2">Anthropic Claude API Key</label>
            <input 
              type="password" 
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent outline-none transition-all"
              placeholder="sk-ant-api03-..."
            />
            <p className="text-xs text-ink-3 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              Used for Claude 3.5 Sonnet & Claude 3 Opus agent steps. Get key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Anthropic Console</a>.
            </p>
          </div>

          <div className="space-y-2 max-w-2xl pt-4 border-t border-line">
            <label className="text-sm font-medium text-ink-2">OpenArt API Key</label>
            <input 
              type="password" 
              value={openartKey}
              onChange={(e) => setOpenartKey(e.target.value)}
              className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent outline-none transition-all"
              placeholder="openart-api-..."
            />
            <p className="text-xs text-ink-3 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              Required for OpenArt image and video generation.
            </p>
          </div>

          <div className="space-y-2 max-w-2xl pt-4 border-t border-line">
            <label className="text-sm font-medium text-ink-2">Seedance API Key</label>
            <input 
              type="password" 
              value={seedanceKey}
              onChange={(e) => setSeedanceKey(e.target.value)}
              className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent outline-none transition-all"
              placeholder="seedance-api-..."
            />
            <p className="text-xs text-ink-3 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              Required for Seedance cinematic AI video generation.
            </p>
          </div>
        </div>
      </div>

      {/* Social Media Credentials */}
      <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <Share2 className="w-5 h-5 text-ink-4" />
          <h2 className="text-lg font-semibold text-ink">Social Media API Credentials</h2>
        </div>

        <p className="text-sm text-ink-3 pb-2">
          Provide your developer tokens to enable automatic publishing for your connected brands.
        </p>
        
        {/* Twitter */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Twitter className="w-4 h-4 text-ink-3" />
            <h3 className="font-medium text-ink-2">Twitter (X)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-3">Bearer Token / API Key</label>
              <input 
                type="password" 
                value={twitterApiKey}
                onChange={(e) => setTwitterApiKey(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-ink outline-none"
                placeholder="Enter consumer key or bearer token"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-3">API Secret / Access Secret</label>
              <input 
                type="password" 
                value={twitterApiSecret}
                onChange={(e) => setTwitterApiSecret(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-ink outline-none"
                placeholder="Enter API secret"
              />
            </div>
          </div>
        </div>

        <hr className="border-line" />

        {/* LinkedIn */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Linkedin className="w-4 h-4 text-ink-3" />
            <h3 className="font-medium text-ink-2">LinkedIn</h3>
          </div>
          <div className="space-y-2 max-w-2xl">
            <label className="text-xs font-medium text-ink-3">User Access Token</label>
            <input 
              type="password" 
              value={linkedinToken}
              onChange={(e) => setLinkedinToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-ink outline-none"
              placeholder="Enter LinkedIn standard access token"
            />
          </div>
        </div>

        <hr className="border-line" />

        {/* Facebook */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Facebook className="w-4 h-4 text-ink-3" />
            <h3 className="font-medium text-ink-2">Facebook</h3>
          </div>
          <div className="space-y-2 max-w-2xl">
            <label className="text-xs font-medium text-ink-3">Page Access Token</label>
            <input 
              type="password" 
              value={facebookToken}
              onChange={(e) => setFacebookToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-ink outline-none"
              placeholder="Enter Facebook Page access token"
            />
          </div>
        </div>

        <hr className="border-line" />

        {/* Instagram */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Instagram className="w-4 h-4 text-ink-3" />
            <h3 className="font-medium text-ink-2">Instagram</h3>
          </div>
          <div className="space-y-2 max-w-2xl">
            <label className="text-xs font-medium text-ink-3">Graph API Access Token</label>
            <input 
              type="password" 
              value={instagramToken}
              onChange={(e) => setInstagramToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-ink outline-none"
              placeholder="Enter Instagram Graph API token"
            />
          </div>
        </div>

      </div>

      {/* Content sources — stored server-side, unlike the browser-held AI keys */}
      <div className="space-y-3 pt-2">
        <div>
          <h2 className="text-base font-bold text-ink">Content sources</h2>
          <p className="text-xs text-ink-3">
            Connect a blog to publish to, and a store to promote from. These are saved per brand.
          </p>
        </div>
        <ContentConnections />
      </div>

      <div className="flex justify-end sticky bottom-4">
        <button
          onClick={handleSave}
          className={`inline-flex items-center gap-2 px-6 py-3 font-medium rounded-xl transition-all shadow-lg ${saved ? 'bg-ok text-white' : 'bg-ink text-white hover:bg-ink-2'}`}
        >
          <Save className="w-4 h-4" />
          {saved ? 'Credentials Saved!' : 'Save Integrations'}
        </button>
      </div>
    </div>
  );
}
