/**
 * Shared studio primitives.
 *
 * Every module used to build its own header, tab bar, cards and buttons, each
 * with its own accent hue — blue in Meta Ads, pink in Instagram, emerald in
 * WhatsApp, orange in the MCP connector. The result read as four products.
 * These are the pieces all of them now share, so the only thing that changes
 * between studios is the content.
 */
import React from 'react';
import { cn } from '../lib/utils';
import {
  AlertTriangle, CheckCircle2, Info, X, ChevronRight, Loader2
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow, title, description, actions, children
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-2">
        {eyebrow && (
          <div className="flex items-center gap-2.5">
            <span className="h-px w-6 rounded accent-thread" aria-hidden="true" />
            <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-accent">
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-tight text-ink">
          {title}
        </h1>
        {description && (
          <p className="max-w-[68ch] text-sm leading-relaxed text-ink-3">{description}</p>
        )}
        {children}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
}

export function TabNav({
  tabs, active, onChange
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="scroll-slim -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-line bg-sunk p-1"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors',
              isActive
                ? 'bg-surface text-ink shadow-xs'
                : 'text-ink-3 hover:text-ink'
            )}
          >
            {Icon && (
              <Icon className={cn('h-4 w-4', isActive ? 'text-accent' : 'text-ink-4')} />
            )}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-bold tabular',
                  isActive ? 'bg-accent-soft text-accent-ink' : 'bg-line text-ink-3'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  className, children, padded = true, ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface shadow-sm',
        padded && 'p-6',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  icon: Icon, title, description, actions
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-accent" />}
          {title}
        </h3>
        {description && (
          <p className="max-w-[70ch] text-xs leading-relaxed text-ink-3">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('text-[10px] font-bold uppercase tracking-[0.12em] text-ink-4', className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-2 shadow-sm',
  accent: 'bg-accent text-white hover:bg-accent-hover shadow-accent',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunk',
  ghost: 'bg-transparent text-ink-2 hover:bg-sunk',
  danger: 'bg-danger-soft text-danger border border-danger-line hover:bg-danger hover:text-white'
};

export function Button({
  variant = 'secondary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const sizes = {
    sm: 'px-3 py-1.5 text-[11px] gap-1.5 rounded-lg',
    md: 'px-4 py-2.5 text-xs gap-2 rounded-xl',
    lg: 'px-5 py-3 text-[13px] gap-2 rounded-xl'
  };

  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_STYLES[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        Icon && <Icon className="h-4 w-4" />
      )}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export type BannerKind = 'error' | 'success' | 'info' | 'warning';

const BANNER_STYLES: Record<BannerKind, { wrap: string; icon: React.ComponentType<{ className?: string }> }> = {
  error:   { wrap: 'bg-danger-soft border-danger-line text-danger', icon: AlertTriangle },
  warning: { wrap: 'bg-warn-soft border-warn-line text-warn', icon: AlertTriangle },
  success: { wrap: 'bg-ok-soft border-ok-line text-ok', icon: CheckCircle2 },
  info:    { wrap: 'bg-accent-soft border-accent-line text-accent-ink', icon: Info }
};

export function Banner({
  kind = 'info', message, detail, onDismiss, action
}: {
  kind?: BannerKind;
  message: React.ReactNode;
  detail?: React.ReactNode;
  onDismiss?: () => void;
  action?: React.ReactNode;
}) {
  const { wrap, icon: Icon } = BANNER_STYLES[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-xl border px-4 py-3.5', wrap)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words text-xs font-bold leading-relaxed">{message}</p>
        {detail && <p className="break-words text-[11px] leading-relaxed opacity-80">{detail}</p>}
        {action}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'blush';

const BADGE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-sunk text-ink-3 border-line',
  accent: 'bg-accent-soft text-accent-ink border-accent-line',
  blush: 'bg-blush-soft text-blush-ink border-blush-line',
  ok: 'bg-ok-soft text-ok border-ok-line',
  warn: 'bg-warn-soft text-warn border-warn-line',
  danger: 'bg-danger-soft text-danger border-danger-line'
};

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
  live?: boolean;
  /** This project has no @types/react, so JSX does not strip `key` for us. */
  key?: React.Key;
}

export function Badge({ tone = 'neutral', className, children, live }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        BADGE_STYLES[tone],
        live && 'pulse-live',
        className
      )}
    >
      {children}
    </span>
  );
}

/** The live/not-live pill used in every studio header. */
export function ConnectionPill({
  connected, label, onConnect, reconnect
}: {
  connected: boolean;
  label: string;
  onConnect: () => void;
  reconnect?: boolean;
}) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-ok-line bg-ok-soft px-3 py-2 text-xs font-bold text-ok">
        <span className="pulse-live" aria-hidden="true" />
        {label}
      </span>
    );
  }
  return (
    <button
      onClick={onConnect}
      className="inline-flex items-center gap-2 rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-xs font-bold text-warn transition-colors hover:brightness-[0.98]"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      {reconnect ? `Reconnect ${label}` : `Connect ${label}`}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function StatCard({
  label, value, hint, tone = 'neutral', icon: Icon
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'blush';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueTone = {
    neutral: 'text-ink',
    accent: 'text-accent',
    ok: 'text-ok',
    blush: 'text-blush'
  }[tone];

  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{label}</SectionLabel>
        {Icon && <Icon className="h-3.5 w-3.5 text-ink-4" />}
      </div>
      <div className={cn('text-[26px] font-extrabold leading-none tabular', valueTone)}>{value}</div>
      {hint && <div className="text-[11px] font-semibold text-ink-4">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon, title, description, action
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
      {Icon && (
        <div className="mb-1 grid h-11 w-11 place-items-center rounded-xl bg-sunk">
          <Icon className="h-5 w-5 text-ink-4" />
        </div>
      )}
      <p className="text-sm font-bold text-ink">{title}</p>
      {description && (
        <p className="max-w-[46ch] text-xs leading-relaxed text-ink-3">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

export const inputClass =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs text-ink ' +
  'outline-none transition-colors placeholder:text-ink-4 focus:border-accent focus:ring-2 focus:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-4';

export function Field({
  label, hint, required, children, className, action
}: {
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-ink-2">
          {label}
          {required && <span className="ml-1 text-blush">*</span>}
        </label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-ink-4">{hint}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, 'resize-y leading-relaxed', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, 'cursor-pointer font-semibold', props.className)} />;
}

/* ------------------------------------------------------------------ */
/* Device preview frames                                               */
/* ------------------------------------------------------------------ */

/**
 * Previews used to be loose divs whose height drifted with their content, so
 * a caption of a different length changed the shape of the "phone". These
 * frames are fixed to the real aspect ratio of each surface, which is also
 * the ratio the platform will crop to.
 */
const SURFACE_RATIO = {
  /** Instagram feed post — 4:5 is the tallest the feed allows. */
  feed: 'device-feed',
  /** Reels and Stories — full-bleed 9:16. */
  story: 'aspect-[9/16]',
  /** Square feed post. */
  square: 'device-square',
  /** Meta ad creative — 1.91:1 link preview. */
  link: 'aspect-[1.91/1]'
} as const;

export type PreviewSurface = keyof typeof SURFACE_RATIO;

export function PhoneFrame({
  children, label, width = 300
}: {
  children: React.ReactNode;
  label?: string;
  width?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        className="device-portrait w-full overflow-hidden rounded-[28px] border-[6px] border-ink bg-ink shadow-lift"
        style={{ maxWidth: width }}
      >
        <div className="scroll-slim flex h-full flex-col overflow-y-auto bg-surface">
          {children}
        </div>
      </div>
      {label && <SectionLabel>{label}</SectionLabel>}
    </div>
  );
}

export function MediaSlot({
  url, type = 'image', surface = 'square', className, placeholder = 'Select media'
}: {
  url?: string;
  type?: 'image' | 'video';
  surface?: PreviewSurface;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-sunk',
        SURFACE_RATIO[surface],
        className
      )}
    >
      {url ? (
        type === 'video' ? (
          <video src={url} controls className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )
      ) : (
        <div className="absolute inset-0 grid place-items-center px-4 text-center text-[11px] font-semibold text-ink-4">
          {placeholder}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                               */
/* ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function LoadingPage({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-2 py-16 text-sm font-semibold text-ink-3">
      <Spinner className="text-accent" />
      {label}
    </div>
  );
}

export function LinkOut({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] font-bold text-accent underline underline-offset-2 hover:text-accent-hover"
    >
      {children}
      <ChevronRight className="h-3 w-3" />
    </a>
  );
}
