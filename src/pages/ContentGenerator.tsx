import { useState, useEffect } from 'react';
import { getBrands, getBrandById, addPost, Brand, saveTrendToVault, toLocalDatetimeString, parseLocalDatetimeString } from '../dbAdapter';
import { auth } from '../auth';
import { BrandSelector } from '../components/BrandSelector';
import { Loader2, Image as ImageIcon, Video, Type as TypeIcon, Calendar, PenTool, Sparkles, TrendingUp, PartyPopper, RefreshCw, Twitter, Linkedin, Instagram, Facebook, Megaphone, Download, ExternalLink, Tag, Bookmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import * as geminiService from '../services/geminiService';
import { generateOpenArtVideo, generateOpenArtImage, generateSeedanceVideo } from '../services/mediaService';
import { publishPostToPlatforms } from '../services/socialPostingService';
import { generatePaidAdCampaign, downloadGoogleAdsEditorCSV, PaidAdCampaignPackage } from '../services/adService';
import { repurposeContentToMultiChannel, RepurposedMultiChannelPackage } from '../services/repurposerService';
import { Layers, FileText, Share2, Repeat, MessageCircle } from 'lucide-react';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export function ContentGenerator() {
  const [brand, setBrand] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [topic, setTopic] = useState('');
  const [mediaType, setMediaType] = useState<'none' | 'image' | 'video'>('none');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [quality, setQuality] = useState('1K');
  const [videoResolution, setVideoResolution] = useState('720p');
  const [selectedModel, setSelectedModel] = useState('');
  
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['twitter', 'linkedin']);
  
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [generatedMediaUrl, setGeneratedMediaUrl] = useState('');
  const [videoDownloadLink, setVideoDownloadLink] = useState('');
  
  const [scheduling, setScheduling] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    return toLocalDatetimeString(date);
  });
  const [planning, setPlanning] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);
  const [trendSearchQuery, setTrendSearchQuery] = useState('');
  
  // Mode Switcher State
  const [generatorType, setGeneratorType] = useState<'organic' | 'ads' | 'repurpose'>('organic');
  const [adObjective, setAdObjective] = useState('Conversions');
  const [adDestinationUrl, setAdDestinationUrl] = useState('');
  const [generatingAds, setGeneratingAds] = useState(false);
  const [generatedAdCampaign, setGeneratedAdCampaign] = useState<PaidAdCampaignPackage | null>(null);

  // 1-to-Many Repurposer State
  const [repurposerSourceText, setRepurposerSourceText] = useState('');
  const [repurposerSourceType, setRepurposerSourceType] = useState<'blog' | 'url' | 'document' | 'topic'>('blog');
  const [repurposing, setRepurposing] = useState(false);
  const [repurposedPackage, setRepurposedPackage] = useState<RepurposedMultiChannelPackage | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBrand = async () => {
      try {
        const activeBrandId = localStorage.getItem('activeBrandId');
        let brandData = null;

        if (activeBrandId) {
          brandData = await getBrandById(activeBrandId);
        }

        if (!brandData) {
          const allBrands = await getBrands();
          if (allBrands.length > 0) {
            brandData = allBrands[0];
            localStorage.setItem('activeBrandId', brandData.id);
          }
        }

        if (brandData) {
          setBrand(brandData);
        }
      } catch (error) {
        console.error("Error fetching brand:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBrand();

    const draft = localStorage.getItem('draftTopic');
    if (draft) {
      setTopic(draft);
      localStorage.removeItem('draftTopic');
    }
  }, []);

  useEffect(() => {
    if (mediaType === 'image') {
      setSelectedModel('gemini-3.1-flash-image-preview');
    } else if (mediaType === 'video') {
      setSelectedModel('veo-3.1-fast-generate-preview');
    }
  }, [mediaType]);

  const fetchSuggestions = async (brandData: any, query?: string) => {
    setFetchingSuggestions(true);
    try {
      const result = await geminiService.fetchSuggestions(brandData, query);
      setSuggestions(result);
    } catch (error: any) {
      console.error("Error fetching suggestions:", error);
      alert(error.message || "Failed to fetch trending topics. Please try again.");
      setSuggestions([]);
    } finally {
      setFetchingSuggestions(false);
    }
  };

  const handlePlanCalendar = async (days: number) => {
    if (!brand) return;
    setPlanning(true);
    try {
      const result = await geminiService.planCalendar(days, brand);

      if (!Array.isArray(result) || result.length === 0) {
        throw new Error("No plan was generated. Please try again.");
      }

      // Save each planned post to Firestore
      const batch = result.map(async (item: any, index: number) => {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + (index + 1));
        scheduledDate.setHours(10, 0, 0, 0);

        try {
          return await addPost({
            brandId: brand.id,
            content: `${item.topic}\n\n${item.content || ''}`,
            status: 'suggested',
            scheduledTime: { toDate: () => scheduledDate } as any,
            platforms: [item.platform || 'twitter'],
            mediaType: item.mediaType || 'none',
            isPlanned: true
          });
        } catch (error) {
          console.error("Error planning post:", error);
        }
      });

      await Promise.all(batch);
      alert(`Successfully planned a ${days}-day calendar! You can review the suggestions in the Scheduler.`);
      navigate('/schedule');
    } catch (error: any) {
      console.error("Planning failed:", error);
      alert(error.message || "Failed to plan calendar. Please try again.");
    } finally {
      setPlanning(false);
    }
  };

  const handleRunRepurposer = async () => {
    if (!repurposerSourceText) {
      alert("Please enter a URL, blog text, or document snippet to repurpose.");
      return;
    }
    setRepurposing(true);
    try {
      const res = await repurposeContentToMultiChannel({
        inputText: repurposerSourceText,
        inputType: repurposerSourceType,
        brand,
        provider: 'gemini'
      });
      setRepurposedPackage(res);
    } catch (err: any) {
      console.error("Repurposer Error:", err);
      alert(`Repurposer Error: ${err?.message || String(err)}`);
    } finally {
      setRepurposing(false);
    }
  };

  const handleGenerate = async (customTopic?: string, isTrend = false) => {
    const finalTopic = customTopic || topic;
    if (!finalTopic) {
      alert("Please provide a topic or idea.");
      return;
    }
    if (!brand) {
      alert("Please set up your brand first.");
      return;
    }

    // Check for API key
    if (!localStorage.getItem('gemini_api_key')) {
      alert("Please set your Gemini API key in the Integrations page to generate content.");
      navigate('/integrations');
      return;
    }

    setGenerating(true);
    setGeneratedContent('');
    setGeneratedMediaUrl('');

    try {
      const data = await geminiService.generateContent({
        finalTopic,
        isTrend,
        brand,
        selectedPlatforms,
        mediaType,
        aspectRatio,
        quality,
        videoResolution,
        modelName: selectedModel
      });
      
      setGeneratedContent(data.text || '');

      // Handle Media if requested
      if (mediaType === 'image') {
        if (selectedModel === 'openart-image') {
          const openArtUrl = await generateOpenArtImage({ prompt: finalTopic, aspectRatio });
          setGeneratedMediaUrl(openArtUrl);
        } else if (data.mediaUrl) {
          if (brand.logoUrl) {
            // Overlay logo using Canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            const logo = new Image();
            
            await new Promise((resolve) => {
              img.onload = resolve;
              img.src = data.mediaUrl;
            });
            
            await new Promise((resolve) => {
              logo.onload = resolve;
              logo.src = brand.logoUrl;
            });
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            
            const logoWidth = canvas.width * 0.15;
            const logoHeight = (logo.height / logo.width) * logoWidth;
            const padding = 20;
            ctx?.drawImage(logo, canvas.width - logoWidth - padding, canvas.height - logoHeight - padding, logoWidth, logoHeight);
            
            setGeneratedMediaUrl(canvas.toDataURL('image/png'));
          } else {
            setGeneratedMediaUrl(data.mediaUrl);
          }
        }
      } else if (mediaType === 'video') {
        if (selectedModel === 'seedance-video') {
          const seedanceUrl = await generateSeedanceVideo({ prompt: finalTopic, aspectRatio, resolution: videoResolution });
          setGeneratedMediaUrl(seedanceUrl);
        } else if (selectedModel === 'openart-video') {
          const openArtVidUrl = await generateOpenArtVideo({ prompt: finalTopic, aspectRatio });
          setGeneratedMediaUrl(openArtVidUrl);
        } else if (data.videoDownloadLink) {
          setGeneratedMediaUrl(data.videoDownloadLink);
        }
      }

    } catch (error: any) {
      console.error("Generation failed:", error);
      alert(error.message || "Failed to generate content. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSchedule = async (targetStatus?: 'scheduled' | 'suggested') => {
    if (!generatedContent || !brand) return;
    
    setScheduling(true);
    try {
      const scheduleTime = parseLocalDatetimeString(scheduledDate);
      const status = targetStatus || (brand.automationSettings?.mode === 'auto' ? 'scheduled' : 'suggested');

      await addPost({
        brandId: brand.id,
        content: generatedContent,
        mediaUrl: generatedMediaUrl || undefined,
        mediaType: mediaType,
        platforms: selectedPlatforms,
        status: status,
        scheduledTime: scheduleTime.toISOString(),
        userId: auth.currentUser?.uid || 'admin-user-001'
      });

      alert(status === 'scheduled' ? "Post scheduled successfully and added to Calendar!" : "Post saved as suggestion for approval and added to Calendar!");
      navigate('/schedule');
    } catch (error) {
      console.error("Scheduling failed:", error);
      alert("Failed to schedule post: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setScheduling(false);
    }
  };

  const handleScheduleRepurposedPackage = async () => {
    if (!repurposedPackage || !brand) return;

    setScheduling(true);
    try {
      const baseDate = new Date();
      const assets = [
        { content: repurposedPackage.linkedinPost, platforms: ['linkedin'], offsetDays: 1, title: 'LinkedIn Post' },
        { content: repurposedPackage.twitterThread.join('\n\n'), platforms: ['twitter'], offsetDays: 2, title: 'X 5-Tweet Thread' },
        { content: `${repurposedPackage.instagramPackage.caption}\n\nVisual Carousel Layout:\n${repurposedPackage.instagramPackage.carouselSlides.map(s => `Slide ${s.slideNumber}: ${s.slideTitle} - ${s.slideBody}`).join('\n')}`, platforms: ['instagram'], offsetDays: 3, title: 'IG Carousel' },
        { content: `Subject: ${repurposedPackage.emailNewsletter.subjectLine}\n\n${repurposedPackage.emailNewsletter.bodyMarkdown}`, platforms: ['email'], offsetDays: 4, title: 'Newsletter Digest' },
        { content: `YouTube Short / TikTok Script:\nHook: ${repurposedPackage.videoScript.hook}\nBody: ${repurposedPackage.videoScript.scriptBody}\nCTA: ${repurposedPackage.videoScript.callToAction}`, platforms: ['youtube'], offsetDays: 5, title: 'Short Video Script' },
      ];

      const batch = assets.map(async (asset) => {
        const sched = new Date(baseDate);
        sched.setDate(sched.getDate() + asset.offsetDays);
        sched.setHours(10, 0, 0, 0);

        return await addPost({
          brandId: brand.id,
          content: asset.content,
          platforms: asset.platforms,
          status: 'suggested',
          scheduledTime: sched.toISOString(),
          userId: auth.currentUser?.uid || 'admin-user-001'
        });
      });

      await Promise.all(batch);
      alert("All 5 repurposed asset posts have been saved & scheduled into your Calendar Grid!");
      navigate('/schedule');
    } catch (err: any) {
      console.error("Failed to schedule repurposed package:", err);
      alert(`Failed to schedule repurposed assets: ${err?.message || String(err)}`);
    } finally {
      setScheduling(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(platform) 
        ? prev.filter(p => p !== platform) 
        : [...prev, platform]
    );
  };

  if (loading) return <div className="p-8">Loading...</div>;

  if (!brand) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Setup Your Brand First</h2>
        <p className="text-gray-500 mb-4">You need to configure your brand settings before generating content.</p>
        <button onClick={() => navigate('/brand-setup')} className="px-4 py-2 bg-black text-white rounded-lg">Go to Brand Setup</button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Content Studio</h1>
          <p className="text-gray-500 mt-1">Generate multi-platform posts, images, videos, and PPC ad campaigns for your brand.</p>
        </div>
        <div className="flex items-center gap-3">
          <BrandSelector 
            activeBrandId={brand?.id} 
            onBrandChange={(selected) => {
              setBrand(selected);
              localStorage.setItem('activeBrandId', selected.id);
            }} 
          />
        </div>
      </header>
      
      {/* Mode Switcher */}
      <div className="flex flex-wrap bg-gray-100 p-1 rounded-xl border border-gray-200 w-fit">
        <button
          onClick={() => setGeneratorType('organic')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all",
            generatorType === 'organic'
              ? "bg-white text-black shadow-xs font-bold"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          <PenTool className="w-3.5 h-3.5" />
          Organic Posts
        </button>
        <button
          onClick={() => setGeneratorType('repurpose')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all",
            generatorType === 'repurpose'
              ? "bg-black text-white shadow-xs font-bold"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          <Repeat className="w-3.5 h-3.5 text-sky-400" />
          1-to-Many Content Repurposer
        </button>
        <button
          onClick={() => setGeneratorType('ads')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all",
            generatorType === 'ads'
              ? "bg-black text-white shadow-xs font-bold"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          <Megaphone className="w-3.5 h-3.5 text-amber-400" />
          Paid Ad Campaigns
        </button>
      </div>

      {/* 1-to-Many Repurposer Studio */}
      {generatorType === 'repurpose' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-sky-500" />
                  1-to-Many Multi-Channel Content Repurposer
                </h2>
                <p className="text-xs text-gray-500">Transform any single blog post, document, URL, or topic into 6 distinct platform assets (LinkedIn, X Thread, IG Carousel, Newsletter, Short Video Script, Meta Ad).</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Source Type:</span>
                <select
                  value={repurposerSourceType}
                  onChange={(e) => setRepurposerSourceType(e.target.value as any)}
                  className="text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none"
                >
                  <option value="blog">Long-Form Blog / Article</option>
                  <option value="url">Website URL</option>
                  <option value="document">PDF / Document Text</option>
                  <option value="topic">Topic / Concept Brief</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700">Source Content or URL *</label>
              <textarea
                rows={5}
                value={repurposerSourceText}
                onChange={(e) => setRepurposerSourceText(e.target.value)}
                placeholder={repurposerSourceType === 'url' ? "https://example.com/blog-post" : "Paste your article, document text, or key points here..."}
                className="w-full p-3.5 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-black font-mono leading-relaxed"
              />
            </div>

            <button
              onClick={handleRunRepurposer}
              disabled={repurposing || !repurposerSourceText}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all shadow-sm disabled:opacity-50 text-sm"
            >
              {repurposing ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Repeat className="w-5 h-5 text-sky-400" />}
              {repurposing ? 'Repurposing into 6 Channel Formats...' : 'Generate 1-to-Many Asset Package'}
            </button>
          </div>

          {repurposedPackage && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    Repurposed Asset Package: {repurposedPackage.title}
                    <span className="text-xs font-semibold bg-sky-100 text-sky-800 px-2.5 py-0.5 rounded-full">Source: {repurposedPackage.sourceType}</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">5 multi-platform posts generated from your source article.</p>
                </div>
                <button
                  type="button"
                  onClick={handleScheduleRepurposedPackage}
                  disabled={scheduling}
                  className="px-4 py-2 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 shrink-0"
                >
                  {scheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5 text-amber-400" />}
                  {scheduling ? 'Scheduling Assets...' : 'Send All 5 Assets to Calendar Grid'}
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* 1. LinkedIn Post */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5"><Linkedin className="w-4 h-4" /> 1. LinkedIn Post</span>
                  </div>
                  <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">{repurposedPackage.linkedinPost}</p>
                </div>

                {/* 2. Twitter Thread */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-2">
                  <span className="text-xs font-bold text-sky-600 flex items-center gap-1.5"><Twitter className="w-4 h-4" /> 2. X / Twitter 5-Tweet Thread</span>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {repurposedPackage.twitterThread.map((tweet, i) => (
                      <p key={i} className="text-xs text-gray-800 bg-gray-50 p-2.5 rounded-lg border border-gray-100">{tweet}</p>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Instagram Caption + Carousel */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-4">
                <span className="text-xs font-bold text-pink-600 flex items-center gap-1.5"><Instagram className="w-4 h-4" /> 3. Instagram Caption & 5-Slide Visual Carousel Outline</span>
                <p className="text-xs text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap">{repurposedPackage.instagramPackage.caption}</p>
                
                <div>
                  <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">5-Slide Carousel Layout</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    {repurposedPackage.instagramPackage.carouselSlides.map((slide, i) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1 text-xs">
                        <div className="font-bold text-gray-900 flex items-center justify-between">
                          <span>Slide {slide.slideNumber}</span>
                          {i === 0 && <span className="text-[9px] bg-pink-100 text-pink-700 px-1 rounded">Hook</span>}
                          {i === 4 && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded">CTA</span>}
                        </div>
                        <p className="font-semibold text-gray-800 text-[11px]">{slide.slideTitle}</p>
                        <p className="text-gray-600 text-[10px] line-clamp-3">{slide.slideBody}</p>
                        <div className="pt-1 text-[9px] font-mono text-gray-400 border-t border-gray-200 truncate">Graphic: {slide.visualPrompt}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* 4. Email Newsletter Digest */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-2">
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5"><FileText className="w-4 h-4" /> 4. Email Newsletter Digest</span>
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-gray-900">Subject: {repurposedPackage.emailNewsletter.subjectLine}</p>
                    <p className="text-gray-500 text-[11px]">Preview: {repurposedPackage.emailNewsletter.previewText}</p>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap font-mono text-[11px] text-gray-800 max-h-48 overflow-y-auto">{repurposedPackage.emailNewsletter.bodyMarkdown}</div>
                  </div>
                </div>

                {/* 5. Video Script */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-2">
                  <span className="text-xs font-bold text-purple-700 flex items-center gap-1.5"><Video className="w-4 h-4" /> 5. YouTube Short / TikTok Script (60s)</span>
                  <div className="text-xs space-y-2">
                    <p className="font-semibold text-gray-900">Hook (0-3s): {repurposedPackage.videoScript.hook}</p>
                    <p className="text-gray-800 bg-gray-50 p-2.5 rounded-lg border border-gray-100 whitespace-pre-wrap">{repurposedPackage.videoScript.scriptBody}</p>
                    <p className="font-semibold text-purple-700 text-[11px]">CTA: {repurposedPackage.videoScript.callToAction}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggestions & Trend Discovery Section */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              AI Trend Discovery Engine & Quick Topics
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Discover viral industry trends, seasonal news hooks, and high-performing audience topics tailored to {brand?.name || 'your brand'}. Click any topic or chip to auto-generate content packages ready for approval & calendar grid publishing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative">
              <input 
                type="text"
                placeholder="Search trends (e.g. AI, Growth)..."
                value={trendSearchQuery}
                onChange={(e) => setTrendSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchSuggestions(brand, trendSearchQuery)}
                className="pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-black outline-none w-56 sm:w-72"
              />
              <TrendingUp className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
            <button 
              onClick={() => fetchSuggestions(brand, trendSearchQuery)}
              disabled={fetchingSuggestions}
              className="px-4 py-2 bg-black text-white text-xs font-semibold rounded-xl hover:bg-gray-800 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", fetchingSuggestions && "animate-spin")} />
              {trendSearchQuery ? 'Search Trends' : 'Refresh Suggestions'}
            </button>
            <div className="h-6 w-px bg-gray-200 mx-1"></div>
            <button 
              onClick={() => handlePlanCalendar(7)}
              disabled={planning}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 shadow-sm"
            >
              {planning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
              Plan Week (7d)
            </button>
            <button 
              onClick={() => handlePlanCalendar(30)}
              disabled={planning}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 shadow-sm"
            >
              {planning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
              Plan Month (30d)
            </button>
          </div>
        </div>

        {/* Quick Search Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Quick Search:</span>
          {[
            '#AI & Future Trends',
            '#Growth & Viral Hacks',
            '#SaaS & Productivity',
            '#Customer Success',
            '#Industry Insights',
            '#Seasonal Offers'
          ].map((chip) => (
            <button
              key={chip}
              onClick={() => {
                const cleanQuery = chip.replace('#', '');
                setTrendSearchQuery(cleanQuery);
                fetchSuggestions(brand, cleanQuery);
              }}
              className="px-3 py-1 bg-gray-100 hover:bg-black hover:text-white text-gray-700 text-xs font-semibold rounded-full border border-gray-200 transition-all shrink-0"
            >
              {chip}
            </button>
          ))}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {fetchingSuggestions ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse"></div>
            ))
          ) : suggestions.length > 0 ? (
            suggestions.map((s, i) => (
              <div
                key={i}
                onClick={() => {
                  setTopic(s.title);
                  handleGenerate(s.title, true);
                }}
                className="group relative bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-black transition-all shadow-sm flex flex-col h-full cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {s.type === 'trend' || s.type === 'news' ? (
                      <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                    ) : (
                      <PartyPopper className="w-3.5 h-3.5 text-orange-500" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {s.type}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      saveTrendToVault({
                        title: s.title,
                        description: s.description,
                        type: s.type || 'trend',
                        brandId: brand?.id
                      });
                      alert(`Saved "${s.title}" to your Saved Trends Vault!`);
                    }}
                    className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                    title="Bookmark / Save Trend to Vault"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 line-clamp-1 mb-1">{s.title}</h3>
                <p className="text-[11px] text-gray-500 line-clamp-3 flex-1">{s.description}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Use Trend</span>
                  <PenTool className="w-3 h-3 text-gray-300 group-hover:text-black transition-colors" />
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-8 text-center text-gray-400 text-sm italic">
              No trends found. Try searching for a specific topic above.
            </div>
          )}
        </div>
      </div>

      {generatorType === 'ads' ? (
        <div className="space-y-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Ad Input Panel */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6 h-fit">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <Megaphone className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-gray-900">Paid Ad Campaign Setup</h2>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Product / Offer / Headline *</label>
                <textarea 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-black outline-none"
                  placeholder="e.g. Get 30% Off Annual SaaS Subscriptions - Limited Time Cyber Sale"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">Campaign Objective</label>
                  <select 
                    value={adObjective} 
                    onChange={(e) => setAdObjective(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white outline-none"
                  >
                    <option value="Conversions">Conversions / Sales</option>
                    <option value="Leads">Lead Generation</option>
                    <option value="Traffic">Website Traffic</option>
                    <option value="Brand Awareness">Brand Awareness</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">Destination Landing URL</label>
                  <input 
                    type="url"
                    value={adDestinationUrl}
                    onChange={(e) => setAdDestinationUrl(e.target.value)}
                    placeholder="https://yourbrand.com/offer"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg outline-none"
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!topic) {
                    alert("Please specify a Product or Offer description.");
                    return;
                  }
                  setGeneratingAds(true);
                  try {
                    const result = await generatePaidAdCampaign({
                      productOrOffer: topic,
                      brand,
                      targetObjective: adObjective,
                      destinationUrl: adDestinationUrl || 'https://example.com'
                    });
                    setGeneratedAdCampaign(result);
                  } catch (err: any) {
                    alert(`Failed to generate ad campaign: ${err.message || String(err)}`);
                  } finally {
                    setGeneratingAds(false);
                  }
                }}
                disabled={generatingAds || !topic}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 via-amber-600 to-black text-white font-semibold rounded-xl hover:opacity-95 transition-all shadow-md disabled:opacity-50"
              >
                {generatingAds ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-amber-300" />}
                {generatingAds ? 'Crafting High-Converting Ads...' : 'Generate Meta & Google Ad Campaign'}
              </button>
            </div>

            {/* Ad Preview Panel */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm min-h-[450px] flex flex-col">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Ad Creatives & Copy Preview</h2>

              {!generatedAdCampaign && !generatingAds ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <Megaphone className="w-12 h-12 mb-3 opacity-20 text-amber-500" />
                  <p className="text-sm">Meta Ads & Google Search Ads previews will appear here.</p>
                </div>
              ) : generatingAds ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-amber-500" />
                  <p className="text-sm font-medium">Formulating AIDA/PAS Meta copy & Google RSA Headlines...</p>
                </div>
              ) : (
                <div className="space-y-6 overflow-y-auto max-h-[600px] pr-1">
                  {/* Meta Ad Card */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2">
                        <Facebook className="w-4 h-4 text-blue-600" />
                        <Instagram className="w-4 h-4 text-pink-600" />
                        <span className="font-bold text-xs text-gray-900">Meta Sponsored Ad (FB & IG)</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{generatedAdCampaign.metaAd.framework} Framework</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-bold text-gray-400 uppercase text-[10px]">Primary Text (Short):</span>
                        <p className="font-medium text-gray-900 mt-0.5 bg-gray-50 p-2.5 rounded-lg border border-gray-100">{generatedAdCampaign.metaAd.primaryTextShort}</p>
                      </div>

                      <div>
                        <span className="font-bold text-gray-400 uppercase text-[10px]">Headline (Max 45 chars):</span>
                        <p className="font-bold text-gray-900 text-sm mt-0.5">{generatedAdCampaign.metaAd.headline}</p>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="font-bold text-gray-400 uppercase text-[10px]">Description:</span>
                          <p className="text-gray-600 text-xs">{generatedAdCampaign.metaAd.description}</p>
                        </div>
                        <button className="px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-md shadow-xs">
                          {generatedAdCampaign.metaAd.ctaButton}
                        </button>
                      </div>

                      {/* Meta Targeting */}
                      <div className="pt-2 border-t border-gray-100">
                        <span className="font-bold text-gray-400 uppercase text-[10px]">Meta Ads Manager Interest Targeting:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {generatedAdCampaign.metaAd.metaTargeting.interests.map((int, i) => (
                            <span key={i} className="bg-gray-100 text-gray-800 text-[10px] font-medium px-2 py-0.5 rounded border border-gray-200">{int}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Google Search RSA Card */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-emerald-700">Google Search Ads (RSA)</span>
                      </div>
                      <button
                        onClick={() => downloadGoogleAdsEditorCSV(generatedAdCampaign.googleAd)}
                        className="px-3 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1 hover:bg-emerald-700 transition"
                      >
                        <Download className="w-3 h-3" />
                        Export Google Ads CSV
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="font-bold text-gray-400 uppercase text-[10px]">Responsive Search Headlines (15 Max 30 chars):</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
                          {generatedAdCampaign.googleAd.headlines.map((h, i) => (
                            <div key={i} className="bg-gray-50 p-2 rounded border border-gray-100 text-[11px] flex justify-between">
                              <span className="font-semibold text-gray-800 line-clamp-1">{h}</span>
                              <span className="text-[9px] text-gray-400 shrink-0 ml-1">{h.length}/30</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-bold text-gray-400 uppercase text-[10px]">Descriptions (4 Max 90 chars):</span>
                        <div className="space-y-1 mt-1">
                          {generatedAdCampaign.googleAd.descriptions.map((d, i) => (
                            <div key={i} className="bg-gray-50 p-2 rounded border border-gray-100 text-[11px] flex justify-between">
                              <span className="text-gray-800">{d}</span>
                              <span className="text-[9px] text-gray-400 shrink-0 ml-1">{d.length}/90</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-gray-100">
                        <span className="font-bold text-gray-400 uppercase text-[10px]">PPC Keywords:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {generatedAdCampaign.googleAd.keywords.map((kw, i) => (
                            <span key={i} className="font-mono text-[10px] bg-emerald-50 text-emerald-900 px-2 py-0.5 rounded border border-emerald-100">{kw}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6 h-fit">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">What do you want to post about?</label>
            <textarea 
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all resize-none"
              placeholder="e.g., Announcing our new eco-friendly packaging initiative..."
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">Target Platforms</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'twitter', name: 'Twitter', icon: Twitter },
                { id: 'linkedin', name: 'LinkedIn', icon: Linkedin },
                { id: 'instagram', name: 'Instagram', icon: Instagram },
                { id: 'facebook', name: 'Facebook', icon: Facebook },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                    selectedPlatforms.includes(p.id)
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  )}
                >
                  <p.icon className="w-3.5 h-3.5" />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">Include Media?</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setMediaType('none')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border ${mediaType === 'none' ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <TypeIcon className="w-6 h-6 mb-2 text-gray-700" />
                <span className="text-sm font-medium">Text Only</span>
              </button>
              <button
                onClick={() => setMediaType('image')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border ${mediaType === 'image' ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <ImageIcon className="w-6 h-6 mb-2 text-gray-700" />
                <span className="text-sm font-medium">Image</span>
              </button>
              <button
                onClick={() => setMediaType('video')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border ${mediaType === 'video' ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <Video className="w-6 h-6 mb-2 text-gray-700" />
                <span className="text-sm font-medium">Video</span>
              </button>
            </div>
          </div>

          {mediaType !== 'none' && (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Model</label>
                <div className="flex gap-2">
                  <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white"
                  >
                    {mediaType === 'image' ? (
                      <>
                        <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image</option>
                        <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image</option>
                        <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                        <option value="openart-image">OpenArt Image AI</option>
                      </>
                    ) : (
                      <>
                        <option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast Video</option>
                        <option value="veo-3.1-generate-preview">Veo 3.1 High Quality</option>
                        <option value="seedance-video">Seedance AI Video</option>
                        <option value="openart-video">OpenArt AI Video</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Aspect Ratio</label>
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white"
                  >
                    {mediaType === 'image' ? (
                      <>
                        <option value="1:1">Square (1:1)</option>
                        <option value="4:3">Standard (4:3)</option>
                        <option value="3:4">Portrait (3:4)</option>
                        <option value="16:9">Widescreen (16:9)</option>
                        <option value="9:16">Story (9:16)</option>
                      </>
                    ) : (
                      <>
                        <option value="16:9">Widescreen (16:9)</option>
                        <option value="9:16">Story (9:16)</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Quality</label>
                  {mediaType === 'image' ? (
                    <select 
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white"
                    >
                      <option value="512px">Standard (512px)</option>
                      <option value="1K">High (1K)</option>
                      <option value="2K">Ultra (2K)</option>
                      <option value="4K">Max (4K)</option>
                    </select>
                  ) : (
                    <select 
                      value={videoResolution}
                      onChange={(e) => setVideoResolution(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white"
                    >
                      <option value="720p">HD (720p)</option>
                      <option value="1080p">Full HD (1080p)</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => handleGenerate()}
            disabled={generating || !topic}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <PenTool className="w-5 h-5" />}
            {generating ? 'Generating Content...' : 'Generate Content'}
          </button>
        </div>

        {/* Output Section */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm min-h-[500px] flex flex-col">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Preview</h2>
          
          {!generatedContent && !generating ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <PenTool className="w-12 h-12 mb-4 opacity-20" />
              <p>Your generated content will appear here.</p>
            </div>
          ) : generating ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Crafting the perfect post...</p>
              {mediaType === 'video' && <p className="text-xs mt-2 text-gray-400">Video generation may take a few minutes.</p>}
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="space-y-4 mb-6">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-500">
                        {brand.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{brand.name}</div>
                        <div className="text-xs text-gray-500">Just now</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsEditing(!isEditing)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <PenTool className="w-3 h-3" />
                      {isEditing ? 'Preview' : 'Edit Content'}
                    </button>
                  </div>
                  
                  {isEditing ? (
                    <textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all resize-none mb-4"
                    />
                  ) : (
                    <div className="text-sm text-gray-800 whitespace-pre-wrap mb-4 bg-gray-100 p-4 rounded-xl">
                      {generatedContent}
                    </div>
                  )}

                  {generatedMediaUrl && mediaType === 'image' && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <img src={generatedMediaUrl} alt="Generated content" className="w-full h-64 object-cover" />
                    </div>
                  )}
                  
                  {generatedMediaUrl && mediaType === 'video' && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <video src={generatedMediaUrl} controls className="w-full h-64 object-cover" />
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowScheduleModal(true)}
                disabled={scheduling}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {scheduling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5" />}
                {brand.automationSettings?.mode === 'auto' 
                  ? 'Schedule Post' 
                  : 'Save for Approval'}
              </button>
              
              {showScheduleModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
                    <h3 className="font-semibold text-lg">Schedule Post</h3>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-700">Select Date & Time</label>
                      <input
                        type="datetime-local"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setShowScheduleModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium">Cancel</button>
                      <button onClick={() => { handleSchedule(); setShowScheduleModal(false); }} className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium">Confirm</button>
                    </div>
                  </div>
                </div>
              )}
              
              <button
                onClick={async () => {
                  try {
                    const results = await publishPostToPlatforms({
                      content: generatedContent,
                      mediaUrl: generatedMediaUrl,
                      platforms: selectedPlatforms
                    });
                    const summary = results.map(r => `${r.platform}: ${r.message}`).join('\n');
                    alert(`Publishing Results:\n\n${summary}`);
                  } catch (err: any) {
                    alert(`Publishing failed: ${err.message || String(err)}`);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-black border border-black font-medium rounded-xl hover:bg-gray-50 transition-colors mt-2"
              >
                Post Now
              </button>
              
              <div className="mt-4 p-3 bg-gray-100 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  <span>Automation Mode</span>
                  <span className={brand.automationSettings?.mode === 'auto' ? 'text-green-600' : 'text-amber-600'}>
                    {brand.automationSettings?.mode === 'auto' ? 'Auto-Post' : 'Manual Approval'}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {brand.automationSettings?.mode === 'auto' 
                    ? `WotSocial is set to automatically post ${brand.automationSettings?.postsPerPeriod} time(s) per ${brand.automationSettings?.periodUnit}.` 
                    : `WotSocial will suggest ${brand.automationSettings?.postsPerPeriod} post(s) per ${brand.automationSettings?.periodUnit} for your approval.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
);
}
