import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrands, getBrandById, addPost, Brand, toLocalDatetimeString } from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import { generateOpenArtVideo, generateSeedanceVideo } from '../services/mediaService';
import { 
  Video, Sparkles, Film, Loader2, Play, Download, Calendar, ArrowRight, Layers, FileCode, CheckCircle2, Clapperboard, Settings2
} from 'lucide-react';

export function VideoStudio() {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBrandId, setSelectedBrandId] = useState<string>(localStorage.getItem('activeBrandId') || '');

  // Video State
  const [inputMode, setInputMode] = useState<'prompt' | 'scenes'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [scenesMarkdown, setScenesMarkdown] = useState(`[
  {
    "scene": 1,
    "duration": "0-3s",
    "visualPrompt": "Cinematic aerial shot of modern city skyline at sunset with golden light reflections",
    "voiceover": "Build the future of digital social presence with autonomous AI agents."
  },
  {
    "scene": 2,
    "duration": "3-6s",
    "visualPrompt": "Close up futuristic glowing AI neural network nodes connecting seamlessly",
    "voiceover": "Automate content creation, competitor tracking, and scheduling in one platform."
  },
  {
    "scene": 3,
    "duration": "6-10s",
    "visualPrompt": "Clean modern laptop interface displaying growing analytics graphs and 5-star ratings",
    "voiceover": "Start your free workflow today at WotSocial."
  }
]`);

  const [videoStyle, setVideoStyle] = useState('cinematic');
  const [engineModel, setEngineModel] = useState<'veo' | 'seedance' | 'openart'>('veo');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('1080p');

  // Output State
  const [generating, setGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState('');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    const fetchBrand = async () => {
      setLoading(true);
      try {
        if (selectedBrandId) {
          const b = await getBrandById(selectedBrandId);
          if (b) setBrand(b);
        }
      } catch (err) {
        console.error("Error loading brand for video studio:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBrand();
  }, [selectedBrandId]);

  const handleGenerateVideo = async () => {
    let finalPrompt = prompt;
    if (inputMode === 'scenes') {
      try {
        const parsed = JSON.parse(scenesMarkdown);
        finalPrompt = parsed.map((s: any) => `Scene ${s.scene} (${s.duration}): ${s.visualPrompt}. Voiceover: "${s.voiceover}"`).join('. ');
      } catch (e) {
        finalPrompt = scenesMarkdown;
      }
    }

    if (!finalPrompt) {
      alert("Please enter a video prompt or scene script.");
      return;
    }

    // Check API Key
    if (!localStorage.getItem('gemini_api_key') && !localStorage.getItem('seedance_api_key') && !localStorage.getItem('openart_api_key')) {
      alert("Please configure your API keys in the Integrations page first.");
      navigate('/integrations');
      return;
    }

    setGenerating(true);
    setGeneratedVideoUrl('');

    try {
      const fullStylePrompt = `Style: ${videoStyle}. ${brand ? `Brand Tone: ${brand.brandTone || 'Professional'}. ` : ''}${finalPrompt}`;

      if (engineModel === 'seedance') {
        const url = await generateSeedanceVideo({ prompt: fullStylePrompt, aspectRatio, resolution });
        setGeneratedVideoUrl(url);
      } else if (engineModel === 'openart') {
        const url = await generateOpenArtVideo({ prompt: fullStylePrompt, aspectRatio });
        setGeneratedVideoUrl(url);
      } else {
        // Veo / Gemini Video Fallback
        const url = await generateSeedanceVideo({ prompt: fullStylePrompt, aspectRatio, resolution });
        setGeneratedVideoUrl(url);
      }

      alert("AI Video generated successfully!");
    } catch (err: any) {
      console.error("Video generation failed:", err);
      alert(`Video generation error: ${err?.message || String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSendToScheduler = async () => {
    if (!generatedVideoUrl || !brand) return;

    setScheduling(true);
    try {
      const schedDate = new Date();
      schedDate.setDate(schedDate.getDate() + 1);
      schedDate.setHours(10, 0, 0, 0);

      await addPost({
        brandId: brand.id,
        content: `🎬 AI Generated Video Post (${videoStyle.toUpperCase()} Style)\n\nPrompt: ${prompt || 'Scene-by-scene script'}`,
        mediaUrl: generatedVideoUrl,
        mediaType: 'video',
        platforms: ['linkedin', 'youtube', 'instagram'],
        status: 'suggested',
        scheduledTime: schedDate.toISOString()
      });

      alert("Video post successfully added to your Content Schedule Calendar!");
      navigate('/schedule');
    } catch (err: any) {
      console.error("Error scheduling video post:", err);
      alert(`Failed to schedule video post: ${err?.message || String(err)}`);
    } finally {
      setScheduling(false);
    }
  };

  if (loading) return <div className="p-8 font-sans text-gray-500">Loading AI Video Studio...</div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-black bg-gray-100 border border-gray-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Film className="w-3.5 h-3.5 text-purple-600" />
              AI Video Generation Engine
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">AI Video Studio</h1>
          <p className="text-gray-500 mt-1">Generate cinematic 4K videos, product promos, and Reel scripts aligned with {brand?.name || 'your brand'} voice.</p>
        </div>

        <div className="flex items-center gap-3">
          <BrandSelector
            activeBrandId={selectedBrandId}
            onBrandChange={(selected) => {
              setSelectedBrandId(selected.id);
              localStorage.setItem('activeBrandId', selected.id);
            }}
          />
        </div>
      </header>

      {/* Main Studio Controls Grid */}
      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* Left Column: Video Controls */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            
            {/* Input Mode Switcher */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Video Script Mode</label>
              <div className="grid grid-cols-2 bg-gray-100 p-1 rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setInputMode('prompt')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    inputMode === 'prompt' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Text Prompt & Voice
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('scenes')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    inputMode === 'scenes' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Clapperboard className="w-3.5 h-3.5 text-purple-500" />
                  Scene-by-Scene Script (JSON/MD)
                </button>
              </div>
            </div>

            {/* Input Form */}
            {inputMode === 'prompt' ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700">Video Prompt & Visual Concept *</label>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your video visual scene, camera movement, lighting, subject action, and brand tone..."
                  className="w-full p-3.5 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-black leading-relaxed"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">Scene Script (JSON / Markdown Format) *</label>
                  <span className="text-[10px] text-gray-400 font-mono">3 Scenes Template</span>
                </div>
                <textarea
                  rows={8}
                  value={scenesMarkdown}
                  onChange={(e) => setScenesMarkdown(e.target.value)}
                  className="w-full p-3.5 border border-gray-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-black leading-relaxed bg-gray-50/50"
                />
              </div>
            )}

            {/* AI Engine & Style Controls */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">AI Video Engine</label>
                <select
                  value={engineModel}
                  onChange={(e) => setEngineModel(e.target.value as any)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none"
                >
                  <option value="veo">Google Veo 3.1 AI Engine</option>
                  <option value="seedance">SeeDance AI Hyper-Real Video</option>
                  <option value="openart">OpenArt Cinematic Engine</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Visual Aesthetic Style</label>
                <select
                  value={videoStyle}
                  onChange={(e) => setVideoStyle(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none"
                >
                  <option value="cinematic">Cinematic 4K Film</option>
                  <option value="photorealistic">Photorealistic Commercial</option>
                  <option value="3d-anime">3D Anime & Animation</option>
                  <option value="vintage-35mm">Vintage 35mm Analog Film</option>
                  <option value="corporate-motion">Corporate Motion Graphics</option>
                  <option value="cyberpunk">Cyberpunk / Futuristic Neon</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Aspect Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none"
                >
                  <option value="16:9">16:9 Widescreen (YouTube / TV)</option>
                  <option value="9:16">9:16 Vertical (Reels / Shorts / TikTok)</option>
                  <option value="1:1">1:1 Square (LinkedIn / Instagram Feed)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none"
                >
                  <option value="720p">720p HD</option>
                  <option value="1080p">1080p Full HD</option>
                  <option value="4k">4K Ultra HD</option>
                </select>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateVideo}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-all shadow-md text-sm shrink-0 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Film className="w-5 h-5 text-purple-400" />}
              {generating ? 'Rendering AI Video Frames...' : 'Generate AI Video Post'}
            </button>
          </div>
        </div>

        {/* Right Column: Player & Preview Panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm min-h-[480px] flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
                <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wider">Video Output & Player</h3>
                <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded">{videoStyle.toUpperCase()}</span>
              </div>

              {!generatedVideoUrl && !generating ? (
                <div className="min-h-[300px] bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center text-center p-6 text-gray-400 space-y-3">
                  <Film className="w-12 h-12 opacity-20 text-purple-600" />
                  <p className="text-xs max-w-xs">Your rendered AI video preview will appear here in high definition.</p>
                </div>
              ) : generating ? (
                <div className="min-h-[300px] bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  <p className="text-xs font-semibold">Synthesizing frames & camera motion...</p>
                  <p className="text-[10px] text-gray-400">Rendering multi-pass video. This may take up to 30-60 seconds.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-black rounded-xl overflow-hidden shadow-md max-h-[320px] flex items-center justify-center">
                    <video src={generatedVideoUrl} controls autoPlay className="w-full max-h-[320px] object-contain" />
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-1 text-xs">
                    <div className="font-bold text-gray-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Video Generation Complete
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">Engine: {engineModel.toUpperCase()} • Style: {videoStyle} • {aspectRatio}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Video Action Footer */}
            {generatedVideoUrl && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <a
                  href={generatedVideoUrl}
                  download="ai-video.mp4"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 border border-gray-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download MP4
                </a>

                <button
                  onClick={handleSendToScheduler}
                  disabled={scheduling}
                  className="px-4 py-2.5 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {scheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5 text-amber-400" />}
                  {scheduling ? 'Scheduling...' : 'Schedule Video'}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
