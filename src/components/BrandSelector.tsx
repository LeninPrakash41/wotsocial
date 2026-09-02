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
      <div className={`h-10 w-48 bg-sunk rounded-xl animate-pulse ${className}`} />
    );
  }

  if (brands.length === 0) {
    return (
      <button
        onClick={() => navigate('/brand-setup')}
        className={`inline-flex items-center gap-2 px-3 py-2 bg-sunk text-ink-2 hover:bg-ink hover:text-white rounded-xl text-xs font-semibold border border-line transition-colors ${className}`}
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
        className="inline-flex items-center justify-between gap-2 px-3.5 py-2 bg-surface border border-line hover:border-line-strong rounded-xl shadow-2xs text-xs font-semibold text-ink transition-all min-w-[200px]"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-5 h-5 rounded-md bg-sunk border border-line flex items-center justify-center shrink-0 overflow-hidden">
            {selectedBrand?.logoUrl ? (
              <img src={selectedBrand.logoUrl} alt={selectedBrand.name} className="w-full h-full object-contain" />
            ) : (
              <Briefcase className="w-3 h-3 text-ink-3" />
            )}
          </div>
          <span className="truncate max-w-[130px] font-medium">{selectedBrand?.name || 'Select Brand'}</span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-ink-4 shrink-0" />
      </button>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-1.5 w-64 rounded-2xl bg-surface border border-line shadow-lg z-50 p-1.5 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-4 border-b border-line">
            Active Brand Selection
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => handleSelect(b)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                  selectedBrand?.id === b.id 
                    ? 'bg-ink text-white font-medium' 
                    : 'text-ink-2 hover:bg-sunk'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    selectedBrand?.id === b.id ? 'bg-ink-2 text-white' : 'bg-sunk text-ink-3'
                  }`}>
                    {b.name.charAt(0)}
                  </div>
                  <span className="truncate">{b.name}</span>
                </div>
                {selectedBrand?.id === b.id && <Check className="w-3.5 h-3.5 shrink-0 text-white" />}
              </button>
            ))}
          </div>

          <div className="border-t border-line pt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/brand-setup');
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-ink-2 hover:bg-sunk flex items-center gap-2 transition-colors"
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
