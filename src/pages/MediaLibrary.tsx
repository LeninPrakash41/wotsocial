import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMediaAssets, getMediaAssetsAsync, addMediaAsset, addMediaAssetAsync, deleteMediaAsset, MediaAsset, getBrands, Brand } from '../dbAdapter';
import { BrandSelector } from '../components/BrandSelector';
import { saveDraftMedia } from '../services/mediaStorage';
import { 
  Folder, Image as ImageIcon, Video, Upload, Trash2, PenTool, Search, Copy, Check, Calendar, Film, Sparkles, ExternalLink 
} from 'lucide-react';
import { format } from 'date-fns';

export function MediaLibrary() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [selectedBrandId, setSelectedBrandId] = useState<string>(localStorage.getItem('activeBrandId') || '');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadAssets = async () => {
    const list = await getMediaAssetsAsync();
    setAssets(list);
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadPromises = Array.from(files).map((f) => {
      const file = f as File;
      const isVideo = file.type.startsWith('video/');
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const url = reader.result as string;
          await addMediaAssetAsync({
            title: file.name,
            url,
            type: isVideo ? 'video' : 'image',
            source: 'upload',
            brandId: selectedBrandId
          });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    });

    await Promise.all(uploadPromises);
    await loadAssets();
    e.target.value = '';
  };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}" from your Digital Media Vault?`)) return;
    deleteMediaAsset(id);
    setAssets(assets.filter(a => a.id !== id));
  };

  const handleCopyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredAssets = assets.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || a.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-ink bg-sunk border border-line px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Folder className="w-3.5 h-3.5 text-accent" />
              Digital Asset Hub
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Media Library</h1>
          <p className="text-ink-3 mt-1">Upload, organize, and re-use your brand graphics, uploaded photos, and AI rendered videos.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BrandSelector
            activeBrandId={selectedBrandId}
            onBrandChange={(selected) => {
              setSelectedBrandId(selected.id);
              localStorage.setItem('activeBrandId', selected.id);
            }}
          />

          <label className="px-4 py-2 bg-ink text-white text-xs font-bold rounded-xl hover:bg-ink-2 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0 text-nowrap">
            <Upload className="w-3.5 h-3.5" />
            Upload Media
            <input type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-ink-4 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search media assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-ink"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {[
            { id: 'all', label: `All Assets (${assets.length})` },
            { id: 'image', label: `Images (${assets.filter(a => a.type === 'image').length})` },
            { id: 'video', label: `Videos (${assets.filter(a => a.type === 'video').length})` },
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => setFilterType(type.id as any)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterType === type.id ? 'bg-ink text-white' : 'bg-sunk text-ink-2 hover:bg-line'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Media Grid */}
      {filteredAssets.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-sunk rounded-full flex items-center justify-center mx-auto text-ink-4">
            <Folder className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-ink">
            {assets.length === 0 ? 'No Media Assets in Library' : 'No matching media assets'}
          </h3>
          <p className="text-sm text-ink-3 max-w-md mx-auto">
            {assets.length === 0 
              ? 'Upload your brand logos, product photos, or generate AI videos to build your persistent digital media vault.'
              : 'Try clearing your search query or switching filters.'}
          </p>
          <label className="px-6 py-3 bg-ink text-white font-bold rounded-xl text-xs hover:bg-ink-2 transition-all inline-flex items-center gap-2 shadow-md cursor-pointer">
            <Upload className="w-4 h-4 text-warn" /> Upload Your First Asset
            <input type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredAssets.map((asset) => (
            <div key={asset.id} className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
              <div className="min-w-0 flex-1">
                {/* Media Preview Container */}
                <div className="relative h-48 bg-ink flex items-center justify-center overflow-hidden border-b border-line">
                  {asset.type === 'image' ? (
                    <img src={asset.url} alt={asset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <video src={asset.url} controls className="w-full h-full object-cover" />
                  )}

                  <span className={`absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    asset.type === 'video' ? 'bg-accent text-white' : 'bg-ink/80 text-white'
                  }`}>
                    {asset.type}
                  </span>
                </div>

                <div className="p-4 space-y-1">
                  <h3 className="font-bold text-xs text-ink truncate" title={asset.title}>{asset.title}</h3>
                  <p className="text-[10px] text-ink-4">Added {format(new Date(asset.createdAt), 'MMM d, yyyy')}</p>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="p-3 border-t border-line bg-sunk flex items-center justify-between gap-2 text-xs">
                <button
                  onClick={() => handleCopyUrl(asset.id, asset.url)}
                  className="p-1.5 text-ink-3 hover:text-ink hover:bg-line rounded-lg transition-colors"
                  title="Copy Media URL"
                >
                  {copiedId === asset.id ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={async () => {
                      await saveDraftMedia(asset.url, asset.type);
                      navigate('/generate');
                    }}
                    className="px-2.5 py-1 bg-ink text-white text-[11px] font-bold rounded-lg hover:bg-ink-2 transition-all flex items-center gap-1 shrink-0 text-nowrap"
                  >
                    <PenTool className="w-3 h-3 text-warn-line" /> Use in Studio
                  </button>

                  <button
                    onClick={() => handleDelete(asset.id, asset.title)}
                    className="p-1.5 text-ink-4 hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
                    title="Delete Asset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
