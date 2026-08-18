import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Calendar, PenTool, LayoutDashboard, TrendingUp, Edit3, Clock } from 'lucide-react';
import { auth } from '../auth';
import { useEffect, useState } from 'react';

export function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(auth.currentUser);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setIsInitialLoading(false);
      if (currentUser) {
        navigate('/dashboard');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleLogin = async () => {
    navigate('/dashboard');
  };

  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f4]">
        <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f4] text-[#0a0a0a] font-sans selection:bg-black selection:text-white">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-black/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <span className="font-bold text-xl tracking-tight">WotSocial</span>
        </div>
        <nav className="flex items-center gap-4">
          {user ? (
            <Link to="/dashboard" className="text-sm font-medium hover:underline underline-offset-4">
              Go to Dashboard
            </Link>
          ) : (
            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingIn ? 'Signing In...' : 'Sign In'}
            </button>
          )}
        </nav>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-100 px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <p className="text-sm text-red-600 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <Sparkles className="w-4 h-4 rotate-45" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-24 md:py-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <h1 className="text-6xl md:text-7xl font-semibold tracking-tighter leading-[0.9]">
              Your brand's <br/>
              <span className="text-gray-500">AI social team.</span>
            </h1>
            <p className="text-lg text-gray-600 max-w-md leading-relaxed">
              WotSocial reads your website, understands your brand guidelines, and generates humanized, relatable content to organically grow your audience.
            </p>
            <div className="flex items-center gap-4">
              {user ? (
                <Link 
                  to="/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
                >
                  Open Dashboard <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <button 
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoggingIn ? (
                    <>Signing In... <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div></>
                  ) : (
                    <>Get Started Free <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              )}
            </div>
          </div>
          
          {/* Hero Graphic */}
          <div className="relative">
            <div className="aspect-square bg-gray-100 rounded-3xl shadow-lg border border-black/5 relative overflow-hidden group">
              {/* Background Image */}
              <img 
                src="https://picsum.photos/seed/social-media-marketing/800/800" 
                alt="Social Media Marketing" 
                className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
              
              {/* Floating UI Elements */}
              <div className="absolute inset-0 p-8 flex flex-col justify-between">
                <div className="space-y-4 relative z-10 self-end">
                  <div className="flex items-center gap-3 bg-white/95 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-white/20 transform translate-x-4">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="pr-4">
                      <div className="text-sm font-bold text-gray-900">Brand Analysis Complete</div>
                      <div className="text-xs text-gray-600">Tone: Professional, Witty</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 relative z-10 self-start w-3/4">
                  <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-white/20 p-5 shadow-xl transform -translate-x-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                        <TrendingUp className="w-3 h-3 text-blue-600" />
                      </div>
                      <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Trending Now</span>
                    </div>
                    <div className="w-3/4 h-2 bg-gray-200 rounded-full mb-2"></div>
                    <div className="w-1/2 h-2 bg-gray-200 rounded-full mb-4"></div>
                    <div className="flex gap-2">
                      <img src="https://picsum.photos/seed/ai-generated-1/100/100" className="w-16 h-16 rounded-lg object-cover" alt="Generated content 1" referrerPolicy="no-referrer" />
                      <img src="https://picsum.photos/seed/ai-generated-2/100/100" className="w-16 h-16 rounded-lg object-cover" alt="Generated content 2" referrerPolicy="no-referrer" />
                    </div>
                  </div>
                  <div className="flex justify-end transform translate-x-8">
                    <div className="px-4 py-2 bg-black text-white text-sm font-medium rounded-full shadow-lg flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Scheduled for Tomorrow
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Showcases */}
        <div className="mt-32 space-y-32">
          {/* Content Creation Showcase */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1 relative">
              <img 
                src="https://picsum.photos/seed/content-creation-ai/800/600" 
                alt="AI Content Creation" 
                className="rounded-3xl shadow-lg object-cover w-full aspect-[4/3]"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-6 -right-6 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <PenTool className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm font-bold">Multimodal AI</div>
                  <div className="text-xs text-gray-500">Text, Images & Video</div>
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2 space-y-6">
              <h2 className="text-4xl font-semibold tracking-tight">Create at the speed of thought.</h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Stop staring at a blank page. WotSocial uses advanced AI to generate high-quality text, stunning images, and cinematic videos that perfectly match your brand's unique voice and aesthetic.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">✓</div>
                  Humanized, relatable copywriting
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">✓</div>
                  Custom image generation
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">✓</div>
                  Built-in content editor for full control
                </li>
              </ul>
            </div>
          </div>

          {/* Analytics Showcase */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-4xl font-semibold tracking-tight">Visualize your growth.</h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Don't just post into the void. Track your engagement, analyze what works, and let our AI provide actionable insights to continuously improve your social media strategy.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">✓</div>
                  Real-time performance tracking
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">✓</div>
                  AI-powered engagement insights
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">✓</div>
                  Trend analysis and suggestions
                </li>
              </ul>
            </div>
            <div className="relative">
              <img 
                src="https://picsum.photos/seed/analytics-dashboard/800/600" 
                alt="Analytics Dashboard" 
                className="rounded-3xl shadow-lg object-cover w-full aspect-[4/3]"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -top-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-bold">+124% Growth</div>
                  <div className="text-xs text-gray-500">This month</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold tracking-tight">Everything you need to scale.</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-6">
              <LayoutDashboard className="w-6 h-6 text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Brand Understanding</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Upload your guidelines or link your website. We extract your exact tone, personality, and colors to ensure every post is perfectly aligned.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-6">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Real-time Trends</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              WotSocial tracks Google Search trends in your industry. Instantly generate grounded, timely content that joins the global conversation.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-6">
              <Edit3 className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Full Creative Control</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Refine AI-generated posts with our built-in editor. Tweak the copy, hashtags, or media before it goes live to ensure your unique voice shines.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-6">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Granular Scheduling</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Set your exact posting frequency—per day, week, or month. WotSocial suggests or auto-posts content based on your specific needs.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-6">
              <PenTool className="w-6 h-6 text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Multimodal Assets</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Generate high-quality images and cinematic videos alongside your text posts for a complete, professional social media presence.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-6">
              <Calendar className="w-6 h-6 text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Content Calendar</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Manage all your upcoming content in one place. Approve suggestions or reschedule posts with a single click.
            </p>
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}
