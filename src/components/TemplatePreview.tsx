/**
 * Template thumbnails.
 *
 * A poster template was previously only a name and a paragraph, which made it
 * hard to tell "Bold Statement" from "Announcement" without reading both. This
 * draws each layout's actual composition — where the headline sits, how much
 * room the body gets, where the image goes — in the brand's own colours, so
 * the picker shows the shape you are about to commit fifty posters to.
 *
 * Drawn rather than photographed: a stock image would show one interpretation,
 * where what matters is the structure the agent has to write into.
 */
import { PosterTemplate } from '../services/studioApi';
import { cn } from '../lib/utils';

export interface PreviewPalette {
  primary: string;
  secondary: string;
  accent: string;
}

const DEFAULT_PALETTE: PreviewPalette = {
  primary: '#17161A',
  secondary: '#6D4AFF',
  accent: '#DB4F9E'
};

/** Falls back sensibly when a brand has only some of its colours set. */
export const paletteFromBrand = (brand?: {
  primaryColor?: string; secondaryColor?: string; accentColor?: string; brandColors?: string[];
} | null): PreviewPalette => {
  const extra = brand?.brandColors || [];
  return {
    primary: brand?.primaryColor || extra[0] || DEFAULT_PALETTE.primary,
    secondary: brand?.secondaryColor || extra[1] || DEFAULT_PALETTE.secondary,
    accent: brand?.accentColor || extra[2] || DEFAULT_PALETTE.accent
  };
};

const RATIO: Record<string, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  story: 'aspect-[9/16]',
  landscape: 'aspect-[1.91/1]'
};

/** A block of "text" — the bar widths suggest a real line without faking copy. */
function Lines({ widths, color, height = 3, gap = 3 }: {
  widths: number[]; color: string; height?: number; gap?: number;
}) {
  return (
    <div className="flex flex-col" style={{ gap }}>
      {widths.map((w, i) => (
        <div key={i} style={{ width: `${w}%`, height, background: color, borderRadius: 999 }} />
      ))}
    </div>
  );
}

export function TemplatePreview({
  template, palette = DEFAULT_PALETTE, className, selected
}: {
  template: Pick<PosterTemplate, 'layout' | 'ratio' | 'name'>;
  palette?: PreviewPalette;
  className?: string;
  selected?: boolean;
}) {
  const { primary, secondary, accent } = palette;
  const ink = 'rgba(255,255,255,0.92)';
  const inkDim = 'rgba(255,255,255,0.5)';
  const onLight = 'rgba(23,22,26,0.75)';
  const onLightDim = 'rgba(23,22,26,0.35)';

  const body = (() => {
    switch (template.layout) {
      case 'centered':
        return (
          <div className="flex h-full flex-col justify-center gap-2 p-4" style={{ background: primary }}>
            <Lines widths={[85, 65]} color={ink} height={6} gap={4} />
            <Lines widths={[70, 45]} color={inkDim} />
            <div className="mt-1 h-3 w-12 rounded" style={{ background: accent }} />
          </div>
        );

      case 'split-horizontal':
        return (
          <div className="flex h-full flex-col">
            <div className="flex flex-1 flex-col justify-center gap-1.5 p-3" style={{ background: '#E8E6EC' }}>
              <Lines widths={[80, 55]} color={onLight} height={4} />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-1.5 p-3" style={{ background: secondary }}>
              <Lines widths={[75, 50]} color={ink} height={4} />
            </div>
          </div>
        );

      case 'split-vertical':
        return (
          <div className="flex h-full">
            <div className="flex flex-1 items-end p-2.5" style={{ background: '#D6D3DE' }}>
              <Lines widths={[80, 55]} color={onLight} height={3} />
            </div>
            <div className="w-px" style={{ background: 'rgba(255,255,255,.6)' }} />
            <div className="flex flex-1 items-end p-2.5" style={{ background: secondary }}>
              <Lines widths={[80, 55]} color={ink} height={3} />
            </div>
          </div>
        );

      case 'hero-number':
        return (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4" style={{ background: primary }}>
            <div
              className="text-3xl font-extrabold leading-none"
              style={{ color: accent, letterSpacing: '-0.04em' }}
            >
              4.8×
            </div>
            <Lines widths={[70, 45]} color={inkDim} />
          </div>
        );

      case 'list':
        return (
          <div className="flex h-full flex-col" style={{ background: '#FFFFFF' }}>
            <div className="px-3 py-2.5" style={{ background: primary }}>
              <Lines widths={[75]} color={ink} height={5} />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2.5 px-3">
              {[92, 78, 85, 64].map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: i % 2 ? secondary : accent }}
                  />
                  <div style={{ width: `${w}%`, height: 3, background: onLightDim, borderRadius: 999 }} />
                </div>
              ))}
            </div>
          </div>
        );

      case 'quote':
        return (
          <div className="flex h-full flex-col justify-center gap-2.5 p-4" style={{ background: secondary }}>
            <div className="text-2xl font-black leading-none" style={{ color: 'rgba(255,255,255,.45)' }}>“</div>
            <Lines widths={[95, 88, 60]} color={ink} height={3.5} />
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-4 w-4 rounded-full" style={{ background: accent }} />
              <div style={{ width: '35%', height: 3, background: inkDim, borderRadius: 999 }} />
            </div>
          </div>
        );

      case 'product':
        return (
          <div className="flex h-full flex-col" style={{ background: '#F5F4F8' }}>
            <div className="flex flex-1 items-center justify-center">
              <div
                className="h-3/5 w-2/5 rounded-lg"
                style={{ background: primary, boxShadow: '0 8px 18px -10px rgba(0,0,0,.5)' }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ background: '#FFFFFF' }}>
              <div className="flex-1">
                <Lines widths={[85, 50]} color={onLight} height={3} />
              </div>
              <div className="h-4 w-9 shrink-0 rounded" style={{ background: accent }} />
            </div>
          </div>
        );

      case 'offer-badge':
        return (
          <div className="relative flex h-full flex-col justify-center gap-2 p-4" style={{ background: accent }}>
            <div
              className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full text-[9px] font-extrabold"
              style={{ background: '#FFFFFF', color: accent }}
            >
              20%
            </div>
            <Lines widths={[70, 50]} color={ink} height={5} gap={4} />
            <Lines widths={[85]} color={inkDim} />
            <div className="mt-1 h-3.5 w-14 rounded" style={{ background: '#FFFFFF' }} />
          </div>
        );

      case 'editorial':
        return (
          <div className="flex h-full flex-col gap-2.5 p-4" style={{ background: '#FFFFFF' }}>
            <Lines widths={[80, 55]} color={primary} height={5} gap={4} />
            <div className="h-px w-full" style={{ background: '#E8E6EC' }} />
            <Lines widths={[100, 95, 90, 97, 60]} color={onLightDim} height={2.5} gap={4} />
            <div className="mt-auto flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full" style={{ background: secondary }} />
              <div style={{ width: '30%', height: 3, background: onLightDim, borderRadius: 999 }} />
            </div>
          </div>
        );

      case 'documentary':
        return (
          <div className="relative h-full" style={{ background: primary }}>
            {/* A stand-in for the photograph, with the caption band over it. */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(120% 90% at 30% 25%, ${secondary}66 0%, transparent 60%),
                             radial-gradient(90% 70% at 80% 80%, ${accent}55 0%, transparent 55%)`
              }}
            />
            <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-3"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,.72), transparent)' }}>
              <Lines widths={[70]} color={ink} height={4} />
              <Lines widths={[95, 55]} color={inkDim} height={2.5} />
            </div>
          </div>
        );

      default:
        return <div className="h-full" style={{ background: primary }} />;
    }
  })();

  return (
    <div
      role="img"
      aria-label={`${template.name} layout preview`}
      className={cn(
        'w-full overflow-hidden rounded-lg border transition-colors',
        selected ? 'border-accent' : 'border-line',
        RATIO[template.ratio] || RATIO.square,
        className
      )}
    >
      {body}
    </div>
  );
}
