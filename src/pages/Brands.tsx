import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrands, deleteBrand } from '../dbAdapter';
import { auth } from '../auth';
import { Plus, Globe, Settings, Trash2, ExternalLink, Briefcase, Bot, Layers } from 'lucide-react';

export function Brands() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const brandsList = await getBrands();
        setBrands(brandsList);
      } catch (error) {
        console.error("Error fetching brands:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBrands();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will remove all associated settings.`)) return;
    
    try {
      await deleteBrand(id);
      setBrands(brands.filter(b => b.id !== id));
    } catch (error) {
      console.error("Error deleting brand:", error);
      alert("Failed to delete brand.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ink"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Brand Identities</h1>
          <p className="text-ink-3 mt-1">Manage multiple brands and their content strategies.</p>
        </div>
        <button
          onClick={() => navigate('/brand-setup')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-white font-medium rounded-xl hover:bg-ink-2 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add New Brand
        </button>
      </header>

      {brands.length === 0 ? (
        <div className="bg-surface border-2 border-dashed border-line rounded-3xl p-12 text-center">
          <div className="w-16 h-16 bg-sunk rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-ink-4" />
          </div>
          <h3 className="text-lg font-medium text-ink">No brands yet</h3>
          <p className="text-ink-3 mt-1 mb-6">Create your first brand identity to start generating content.</p>
          <button
            onClick={() => navigate('/brand-setup')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-white font-medium rounded-xl hover:bg-ink-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Brand
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brands.map((brand) => (
            <div 
              key={brand.id}
              className="flex h-full flex-col bg-surface border border-line rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-sunk rounded-xl flex items-center justify-center overflow-hidden border border-line">
                  {brand.logoUrl ? (
                    <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xl font-bold text-ink-4">{brand.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    onClick={() => navigate(`/brand-setup/${brand.id}`)}
                    className="p-2 text-ink-4 hover:text-ink hover:bg-sunk rounded-lg transition-colors"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(brand.id, brand.name)}
                    className="p-2 text-ink-4 hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-ink mb-1">{brand.name}</h3>
              <div className="text-sm text-ink-3 mb-4 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                {brand.websiteUrl ? (
                  <a 
                    href={brand.websiteUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:text-ink hover:underline inline-flex items-center gap-1"
                  >
                    {new URL(brand.websiteUrl).hostname}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  'No website'
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {brand.industry && (
                  <span className="px-2 py-0.5 bg-sunk text-ink-3 text-[10px] font-medium rounded-full uppercase tracking-wider">
                    {brand.industry}
                  </span>
                )}
                {brand.category && (
                  <span className="px-2 py-0.5 bg-accent-soft text-accent text-[10px] font-medium rounded-full uppercase tracking-wider">
                    {brand.category}
                  </span>
                )}
              </div>

              {(() => {
                const voice = (brand.agentResearchData as any)?.siteAnalysis?.brandVoice || brand.brandTone;
                const hasStrategy = Boolean((brand.agentResearchData as any)?.siteAnalysis);
                return (
                  <div className="mb-5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        hasStrategy ? 'border-ok-line bg-ok-soft text-ok' : 'border-warn-line bg-warn-soft text-warn'
                      }`}>
                        {hasStrategy ? 'Voice learned' : 'Voice not learned'}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-ink-3">
                      {voice || 'Run the Brand DNA Analyst to learn this brand’s voice — every agent writes from it.'}
                    </p>
                  </div>
                );
              })()}

              {/* Pinned to the bottom so cards of different heights still line up. */}
              <div className="mt-auto grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    localStorage.setItem('activeBrandId', brand.id);
                    navigate(`/brand-strategy/${brand.id}`);
                  }}
                  className="col-span-2 py-2 bg-ink text-white text-xs font-semibold rounded-xl hover:bg-ink-2 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  title="View saved AI brand positioning, competitor research, and content pillars"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Strategy Hub
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('activeBrandId', brand.id);
                    navigate('/agents');
                  }}
                  className="py-2 bg-sunk text-ink text-xs font-semibold rounded-xl hover:bg-line transition-all border border-line flex items-center justify-center gap-1"
                >
                  <Bot className="w-3.5 h-3.5" />
                  AI Studio
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('activeBrandId', brand.id);
                    navigate('/dashboard');
                  }}
                  className="py-2 bg-sunk text-ink text-xs font-medium rounded-xl hover:bg-sunk transition-all border border-line"
                >
                  Dashboard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
