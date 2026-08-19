import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSavedTrends, removeSavedTrend, SavedTrend, getBrands, Brand } from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import { 
  TrendingUp, Bookmark, Trash2, PenTool, Repeat, Search, Sparkles, PartyPopper, Calendar, ArrowRight, Layers 
} from 'lucide-react';
import { format } from 'date-fns';

export function TrendsVault() {
  const navigate = useNavigate();
  const [trends, setTrends] = useState<SavedTrend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedBrandId, setSelectedBrandId] = useState<string>(localStorage.getItem('activeBrandId') || '');

  const loadTrends = () => {
    const list = getSavedTrends();
    setTrends(list);
  };

  useEffect(() => {
    loadTrends();
  }, []);

  const handleRemove = (id: string, title: string) => {
    if (!window.confirm(`Remove "${title}" from your Saved Trends Vault?`)) return;
    removeSavedTrend(id);
    setTrends(trends.filter(t => t.id !== id));
  };

  const filteredTrends = trends.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || t.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-black bg-gray-100 border border-gray-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              Content Ideas & Trend Vault
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Saved Trends Library</h1>
          <p className="text-gray-500 mt-1">Revisit your saved trending hooks, viral news topics, and campaign concepts anytime to generate posts in 1 click.</p>
        </div>

        <div className="flex items-center gap-3">
          <BrandSelector
            activeBrandId={selectedBrandId}
            onBrandChange={(selected) => {
              setSelectedBrandId(selected.id);
              localStorage.setItem('activeBrandId', selected.id);
            }}
          />
          <button
            onClick={() => navigate('/generate')}
            className="px-4 py-2 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <PenTool className="w-3.5 h-3.5" />
            Discover New Trends
          </button>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search saved trends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {[
            { id: 'all', label: 'All Saved' },
            { id: 'trend', label: 'Viral Trends' },
            { id: 'news', label: 'Industry News' },
            { id: 'holiday', label: 'Holidays & Seasonal' },
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => setFilterType(type.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterType === type.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trends Grid */}
      {filteredTrends.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500">
            <Bookmark className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">
            {trends.length === 0 ? 'No Saved Trends in Vault Yet' : 'No matching trends found'}
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {trends.length === 0 
              ? 'When exploring trending topics in Content Studio, click the bookmark icon on any trend card to save it here for future reuse.'
              : 'Try adjusting your search query or category filter.'}
          </p>
          <button
            onClick={() => navigate('/generate')}
            className="px-6 py-3 bg-black text-white font-bold rounded-xl text-xs hover:bg-gray-800 transition-all inline-flex items-center gap-2 shadow-md"
          >
            <TrendingUp className="w-4 h-4 text-blue-400" /> Explore & Bookmark Trending Topics
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTrends.map((t) => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                    t.type === 'holiday' ? 'bg-amber-100 text-amber-800' :
                    t.type === 'news' ? 'bg-purple-100 text-purple-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {t.type === 'holiday' ? <PartyPopper className="w-3 h-3 text-amber-600" /> : <TrendingUp className="w-3 h-3" />}
                    {t.type}
                  </span>

                  <button
                    onClick={() => handleRemove(t.id, t.title)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove from Vault"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="font-bold text-base text-gray-900 group-hover:text-black mb-2">{t.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">{t.description}</p>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="text-[10px] text-gray-400">Saved {format(new Date(t.savedAt), 'MMM d, yyyy')}</span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      localStorage.setItem('draftTopic', t.title);
                      navigate('/generate');
                    }}
                    className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-all flex items-center gap-1 shadow-xs"
                    title="Generate organic post or video"
                  >
                    <PenTool className="w-3 h-3 text-amber-300" /> Generate
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
