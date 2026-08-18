import { useState, useEffect } from 'react';
import { Save, Key, Shield, AlertCircle, Share2, Instagram, Facebook, Twitter, Linkedin } from 'lucide-react';

export function Integrations() {
  const [geminiKey, setGeminiKey] = useState('');
  const [twitterApiKey, setTwitterApiKey] = useState('');
  const [twitterApiSecret, setTwitterApiSecret] = useState('');
  const [linkedinToken, setLinkedinToken] = useState('');
  const [facebookToken, setFacebookToken] = useState('');
  const [instagramToken, setInstagramToken] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem('gemini_api_key');
    if (key) setGeminiKey(key);

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
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Integrations</h1>
        <p className="text-gray-500 mt-1">Manage your API credentials securely. Keys are stored locally in your browser.</p>
      </header>

      <div className="bg-white border text-gray-800 border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Security First (Bring Your Own Key)</h2>
            <p className="text-gray-500 text-sm mt-1">
              WotSocial does not store your credentials on our servers. Your API keys and tokens never leave your local device and are only sent directly to the APIs when taking actions on your behalf.
            </p>
          </div>
        </div>
      </div>

      {/* AI Key */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
          <Key className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">AI Generation & Analytics</h2>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2 max-w-2xl">
            <label className="text-sm font-medium text-gray-700">Gemini API Key</label>
            <input 
              type="password" 
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
              placeholder="AIzaSy..."
            />
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              Required for AI content generation, planning, and insights. Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google AI Studio</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Social Media Credentials */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
          <Share2 className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Social Media API Credentials</h2>
        </div>

        <p className="text-sm text-gray-500 pb-2">
          Provide your developer tokens to enable automatic publishing for your connected brands.
        </p>
        
        {/* Twitter */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Twitter className="w-4 h-4 text-gray-600" />
            <h3 className="font-medium text-gray-800">Twitter (X)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Bearer Token / API Key</label>
              <input 
                type="password" 
                value={twitterApiKey}
                onChange={(e) => setTwitterApiKey(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                placeholder="Enter consumer key or bearer token"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">API Secret / Access Secret</label>
              <input 
                type="password" 
                value={twitterApiSecret}
                onChange={(e) => setTwitterApiSecret(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                placeholder="Enter API secret"
              />
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* LinkedIn */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Linkedin className="w-4 h-4 text-gray-600" />
            <h3 className="font-medium text-gray-800">LinkedIn</h3>
          </div>
          <div className="space-y-2 max-w-2xl">
            <label className="text-xs font-medium text-gray-600">User Access Token</label>
            <input 
              type="password" 
              value={linkedinToken}
              onChange={(e) => setLinkedinToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
              placeholder="Enter LinkedIn standard access token"
            />
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Facebook */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Facebook className="w-4 h-4 text-gray-600" />
            <h3 className="font-medium text-gray-800">Facebook</h3>
          </div>
          <div className="space-y-2 max-w-2xl">
            <label className="text-xs font-medium text-gray-600">Page Access Token</label>
            <input 
              type="password" 
              value={facebookToken}
              onChange={(e) => setFacebookToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
              placeholder="Enter Facebook Page access token"
            />
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Instagram */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Instagram className="w-4 h-4 text-gray-600" />
            <h3 className="font-medium text-gray-800">Instagram</h3>
          </div>
          <div className="space-y-2 max-w-2xl">
            <label className="text-xs font-medium text-gray-600">Graph API Access Token</label>
            <input 
              type="password" 
              value={instagramToken}
              onChange={(e) => setInstagramToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
              placeholder="Enter Instagram Graph API token"
            />
          </div>
        </div>

      </div>

      <div className="flex justify-end sticky bottom-4">
        <button
          onClick={handleSave}
          className={`inline-flex items-center gap-2 px-6 py-3 font-medium rounded-xl transition-all shadow-lg ${saved ? 'bg-green-600 text-white' : 'bg-black text-white hover:bg-gray-800'}`}
        >
          <Save className="w-4 h-4" />
          {saved ? 'Credentials Saved!' : 'Save Integrations'}
        </button>
      </div>
    </div>
  );
}
