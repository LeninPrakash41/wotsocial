import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Plus, Globe, Settings, Trash2, ExternalLink, Briefcase, Bot } from 'lucide-react';

export function Brands() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBrands = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'brands'),
          where('userId', '==', auth.currentUser.uid)
        );
        const snapshot = await getDocs(q);
        const brandsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
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
      await deleteDoc(doc(db, 'brands', id));
      setBrands(brands.filter(b => b.id !== id));
    } catch (error) {
      console.error("Error deleting brand:", error);
      alert("Failed to delete brand.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Brand Identities</h1>
          <p className="text-gray-500 mt-1">Manage multiple brands and their content strategies.</p>
        </div>
        <button
          onClick={() => navigate('/brand-setup')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add New Brand
        </button>
      </header>

      {brands.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">No brands yet</h3>
          <p className="text-gray-500 mt-1 mb-6">Create your first brand identity to start generating content.</p>
          <button
            onClick={() => navigate('/brand-setup')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
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
              className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border border-gray-100">
                  {brand.logoUrl ? (
                    <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xl font-bold text-gray-400">{brand.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => navigate(`/brand-setup/${brand.id}`)}
                    className="p-2 text-gray-400 hover:text-black hover:bg-gray-50 rounded-lg transition-colors"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(brand.id, brand.name)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-1">{brand.name}</h3>
              <div className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                {brand.websiteUrl ? (
                  <a 
                    href={brand.websiteUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:text-black hover:underline inline-flex items-center gap-1"
                  >
                    {new URL(brand.websiteUrl).hostname}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  'No website'
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-6">
                {brand.industry && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded-full uppercase tracking-wider">
                    {brand.industry}
                  </span>
                )}
                {brand.category && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded-full uppercase tracking-wider">
                    {brand.category}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    localStorage.setItem('activeBrandId', brand.id);
                    navigate('/agents');
                  }}
                  className="py-2 bg-purple-50 text-purple-900 text-xs font-semibold rounded-xl hover:bg-purple-900 hover:text-white transition-all border border-purple-100 flex items-center justify-center gap-1"
                >
                  <Bot className="w-3.5 h-3.5" />
                  AI Agents
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('activeBrandId', brand.id);
                    navigate('/dashboard');
                  }}
                  className="py-2 bg-gray-50 text-gray-900 text-xs font-medium rounded-xl hover:bg-black hover:text-white transition-all border border-gray-100"
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
