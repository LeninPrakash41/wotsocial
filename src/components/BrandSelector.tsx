import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrands, Brand } from '../dbAdapter';
import { Briefcase, ChevronDown, Plus, Check } from 'lucide-react';

interface BrandSelectorProps {
  activeBrandId?: string;
  onBrandChange?: (brand: Brand) => void;
  className?: string;
}

export function BrandSelector({ activeBrandId, onBrandChange, className = '' }: BrandSelectorProps) {
  const navigate = useNavigate();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const loadBrands = async () => {
      try {
        const brandList = await getBrands();
        setBrands(brandList);

        const currentActiveId = activeBrandId || localStorage.getItem('activeBrandId') || brandList[0]?.id || '';
        const found = brandList.find(b => b.id === currentActiveId) || brandList[0] || null;

        if (found) {
          setSelectedBrand(found);
          localStorage.setItem('activeBrandId', found.id);
          if (onBrandChange && found.id !== activeBrandId) {
            onBrandChange(found);
          }
        }
      } catch (err) {
        console.error("Error loading brands in selector:", err);
      } finally {
        setLoading(false);
      }
    };

    loadBrands();
  }, [activeBrandId]);

  const handleSelect = (brand: Brand) => {
    setSelectedBrand(brand);
    localStorage.setItem('activeBrandId', brand.id);
    window.dispatchEvent(new CustomEvent('activeBrandChanged', { detail: brand }));
    setIsOpen(false);
    if (onBrandChange) {
      onBrandChange(brand);
    }
  };

  if (loading) {
    return (
      <div className={`h-10 w-48 bg-gray-100 rounded-xl animate-pulse ${className}`} />
    );
  }

  if (brands.length === 0) {
    return (
      <button
        onClick={() => navigate('/brand-setup')}
        className={`inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-800 hover:bg-black hover:text-white rounded-xl text-xs font-semibold border border-gray-200 transition-colors ${className}`}
      >
        <Plus className="w-3.5 h-3.5" />
        Create Brand First
      </button>
    );
  }

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-between gap-2 px-3.5 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl shadow-2xs text-xs font-semibold text-gray-900 transition-all min-w-[200px]"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-5 h-5 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
            {selectedBrand?.logoUrl ? (
              <img src={selectedBrand.logoUrl} alt={selectedBrand.name} className="w-full h-full object-contain" />
            ) : (
              <Briefcase className="w-3 h-3 text-gray-600" />
            )}
          </div>
          <span className="truncate max-w-[130px] font-medium">{selectedBrand?.name || 'Select Brand'}</span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-1.5 w-64 rounded-2xl bg-white border border-gray-200 shadow-lg z-50 p-1.5 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
            Active Brand Selection
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => handleSelect(b)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                  selectedBrand?.id === b.id 
                    ? 'bg-black text-white font-medium' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    selectedBrand?.id === b.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {b.name.charAt(0)}
                  </div>
                  <span className="truncate">{b.name}</span>
                </div>
                {selectedBrand?.id === b.id && <Check className="w-3.5 h-3.5 shrink-0 text-white" />}
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/brand-setup');
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-gray-800 hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Brand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
