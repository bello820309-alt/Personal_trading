import { useEffect, type ReactNode } from 'react';
import { TONE_LABELS, type Tone } from '../indicators/types';
import { CloseIcon } from './icons';

/** 分段選擇按鈕（例如 日K／週K／月K） */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`shrink-0 whitespace-nowrap rounded-md transition-colors ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
              active ? 'bg-accent text-accent-contrast font-medium' : 'text-muted hover:text-fg'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const TONE_CLASS: Record<Tone, string> = {
  bullish: 'bg-up/15 text-up',
  bearish: 'bg-down/15 text-down',
  hot: 'bg-hot/15 text-hot',
  cold: 'bg-cold/15 text-cold',
  neutral: 'bg-surface-2 text-muted',
};

export function ToneBadge({ tone }: { tone: Tone }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {TONE_LABELS[tone]}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-4 ${className}`}>{children}</section>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-fg">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-xl font-bold text-fg md:text-2xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted md:text-base">{sub}</p>}
    </header>
  );
}

/**
 * 手機上是底部抽屜、電腦上是右側抽屜。
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <button type="button" aria-label="關閉" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="safe-bottom absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl border border-line bg-surface shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="關閉">
            <CloseIcon />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${
        tone === 'warn' ? 'border-hot/40 bg-hot/10 text-fg' : 'border-accent/30 bg-accent/10 text-fg'
      }`}
    >
      {children}
    </div>
  );
}

export function Spinner({ label = '載入中…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      {label}
    </div>
  );
}
