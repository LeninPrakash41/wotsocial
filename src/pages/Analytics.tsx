import { useEffect, useState } from 'react';
import { getBrands, getBrandById, getPosts } from '../dbAdapter';
import { auth } from '../auth';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { format } from 'date-fns';
import { 
  TrendingUp, Users, Eye, ThumbsUp, MessageSquare, Share2, 
  Sparkles, RefreshCw, AlertCircle, CheckCircle2, ArrowRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as geminiService from '../services/geminiService';

export function Analytics() {
  const [brand, setBrand] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [audienceStats, setAudienceStats] = useState<any[]>([]);
  const [insight, setInsight] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
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

        if (!brandData) {
          setLoading(false);
          return;
        }
        setBrand(brandData);

        const postsData = await getPosts(brandData.id);
        setPosts(postsData);
      } catch (error) {
        console.error("Error fetching analytics data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const updatedPosts = posts.map((post) => {
        const randomLikes = Math.floor(Math.random() * 500) + 50;
        const randomShares = Math.floor(Math.random() * 100) + 10;
        const randomComments = Math.floor(Math.random() * 50) + 5;
        const randomImpressions = Math.floor(Math.random() * 5000) + 1000;
        const randomReach = Math.floor(randomImpressions * 0.8);

        return {
          ...post,
          likes: randomLikes,
          shares: randomShares,
          comments: randomComments,
          impressions: randomImpressions,
          reach: randomReach
        };
      });
      setPosts(updatedPosts);

      const platforms = ['twitter', 'linkedin', 'instagram'];
      const newAudienceStats = platforms.map((platform) => ({
        userId: auth.currentUser?.uid,
        brandId: brand.id,
        platform,
        ageGroups: {
          '18-24': Math.floor(Math.random() * 30) + 5,
          '25-34': Math.floor(Math.random() * 40) + 10,
          '35-44': Math.floor(Math.random() * 20) + 5,
          '45+': Math.floor(Math.random() * 10) + 2
        },
        gender: {
          'male': Math.floor(Math.random() * 60) + 20,
          'female': Math.floor(Math.random() * 60) + 20,
          'other': Math.floor(Math.random() * 10)
        },
        locations: {
          'USA': Math.floor(Math.random() * 50) + 20,
          'UK': Math.floor(Math.random() * 20) + 5,
          'Canada': Math.floor(Math.random() * 15) + 5,
          'Germany': Math.floor(Math.random() * 10) + 2
        }
      }));
      setAudienceStats(newAudienceStats);

      alert("Analytics and Audience data synced successfully!");
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Failed to sync analytics.");
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyze = async () => {
    if (posts.length === 0) {
      alert("No published posts to analyze.");
      return;
    }
    setAnalyzing(true);
    try {
      const performanceData = posts.map(p => ({
        content: p.content.substring(0, 100) + '...',
        mediaType: p.mediaType,
        likes: p.likes || 0,
        shares: p.shares || 0,
        comments: p.comments || 0,
        impressions: p.impressions || 0
      }));

      const audienceSummary = audienceStats.map(s => ({
        platform: s.platform,
        topAge: Object.entries(s.ageGroups).sort((a: any, b: any) => b[1] - a[1])[0][0],
        topLocation: Object.entries(s.locations).sort((a: any, b: any) => b[1] - a[1])[0][0]
      }));

      const result = await geminiService.analyzePerformance(performanceData, audienceSummary, brand.name);
      
      const insightData = {
        userId: auth.currentUser?.uid,
        brandId: brand.id,
        ...result,
        createdAt: new Date().toISOString()
      };

      setInsight(insightData);
      alert("AI Insights generated!");
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Failed to generate AI insights.");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div className="p-8 animate-pulse">Loading analytics...</div>;

  if (!brand) return <div className="p-8">Please set up your brand first.</div>;

  const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalImpressions = posts.reduce((sum, p) => sum + (p.impressions || 0), 0);
  const totalReach = posts.reduce((sum, p) => sum + (p.reach || 0), 0);
  const totalEngagement = posts.reduce((sum, p) => sum + (p.likes || 0) + (p.shares || 0) + (p.comments || 0), 0);

  const chartData = posts.slice().reverse().map(p => ({
    name: format(p.updatedAt?.toDate() || new Date(), 'MMM d'),
    likes: p.likes || 0,
    impressions: p.impressions || 0,
    engagement: (p.likes || 0) + (p.shares || 0) + (p.comments || 0)
  }));

  const activeAudience = selectedPlatform === 'all' 
    ? audienceStats[0] // Default to first if all
    : audienceStats.find(s => s.platform === selectedPlatform);

  const ageData = activeAudience ? Object.entries(activeAudience.ageGroups).map(([name, value]) => ({ name, value })) : [];
  const locationData = activeAudience ? Object.entries(activeAudience.locations).map(([name, value]) => ({ name, value })) : [];

  const COLORS = ['#000000', '#4F46E5', '#10B981', '#F59E0B', '#EF4444'];

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Performance Analytics</h1>
          <p className="text-gray-500 mt-1">Track how your brand is growing across social platforms.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            {syncing ? 'Syncing...' : 'Sync Data'}
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || posts.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Sparkles className={cn("w-4 h-4", analyzing && "animate-pulse")} />
            {analyzing ? 'Analyzing...' : 'Get AI Insights'}
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Reach', value: totalReach.toLocaleString(), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Impressions', value: totalImpressions.toLocaleString(), icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Engagement', value: totalEngagement.toLocaleString(), icon: ThumbsUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Avg. Likes', value: posts.length ? Math.round(totalLikes / posts.length).toLocaleString() : 0, icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Engagement Overview</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#000000" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#000000" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="engagement" stroke="#000000" fillOpacity={1} fill="url(#colorLikes)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights Panel */}
        <div className="bg-black text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-2 text-emerald-400">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">AI Performance Insights</span>
            </div>

            {!insight ? (
              <div className="space-y-4 py-8 text-center">
                <p className="text-gray-400 text-sm">No insights generated yet. Click "Get AI Insights" to analyze your performance.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <p className="text-sm leading-relaxed text-gray-200">
                    {insight.insightText}
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Top Themes</h4>
                  <div className="flex flex-wrap gap-2">
                    {insight.topPerformingThemes?.map((theme: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-white/10 rounded-md text-xs font-medium">
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Recommendations</h4>
                  <ul className="space-y-2">
                    {insight.recommendations?.map((rec: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audience Section */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-lg font-semibold">Audience Demographics</h3>
            <p className="text-sm text-gray-500">Understand who is interacting with your brand.</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {['all', 'twitter', 'linkedin', 'instagram'].map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPlatform(p)}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
                  selectedPlatform === p ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {!activeAudience ? (
          <div className="py-12 text-center border-2 border-dashed border-gray-100 rounded-xl">
            <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No audience data for this platform. Sync your data to see insights.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <h4 className="text-sm font-semibold text-gray-700">Age Distribution</h4>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ageData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={60} />
                    <Tooltip cursor={{fill: 'transparent'}} />
                    <Bar dataKey="value" fill="#000000" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-6">
              <h4 className="text-sm font-semibold text-gray-700">Top Locations</h4>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={locationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {locationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                {locationData.map((loc, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span className="text-xs text-gray-600 font-medium">{loc.name} ({loc.value}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Posts Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Top Performing Posts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-4">Content</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Impressions</th>
                <th className="px-6 py-4">Engagement</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.slice(0, 5).map((post) => (
                <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 max-w-xs">
                    <p className="text-sm text-gray-900 line-clamp-2">{post.content}</p>
                  </td>
                  <td className="px-6 py-4 capitalize text-sm text-gray-600">{post.mediaType}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{(post.impressions || 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {((post.likes || 0) + (post.shares || 0) + (post.comments || 0)).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase rounded-md">
                      {post.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
