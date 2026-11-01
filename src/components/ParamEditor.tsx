import { useEffect, useState } from 'react';
import type { Market } from '../config/assets';
import { MARKET_LABELS } from '../config/assets';
import { resolveParams, type IndicatorDef, type ParamSpec, type ParamValue, type Params } from '../indicators/types';
import { Sheet } from './ui';

function parseList(s: string, spec: Extract<ParamSpec, { type: 'list' }>): number[] {
  return s
    .split(/[,，、\s]+/)
    .map((x) => Math.floor(Number(x)))
    .filter((x) => Number.isFinite(x) && x >= spec.min && x <= spec.max)
    .slice(0, spec.maxItems);
}

function ParamField({ spec, value, onChange }: { spec: ParamSpec; value: ParamValue; onChange: (v: ParamValue) => void }) {
  const [text, setText] = useState(Array.isArray(value) ? value.join(', ') : String(value));
  useEffect(() => setText(Array.isArray(value) ? value.join(', ') : String(value)), [value]);

  if (spec.type === 'select') {
    return (
      <label className="block">
        <span className="text-sm text-fg">{spec.label}</span>
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg"
        >
          {spec.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {spec.help && <span className="mt-1 block text-xs text-muted">{spec.help}</span>}
      </label>
    );
  }
  if (spec.type === 'list') {
    return (
      <label className="block">
        <span className="text-sm text-fg">{spec.label}</span>
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const list = parseList(text, spec);
            if (list.length) onChange(list);
            else setText(Array.isArray(value) ? value.join(', ') : String(value));
          }}
          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg"
        />
        {spec.help && <span className="mt-1 block text-xs text-muted">{spec.help}</span>}
      </label>
    );
  }
  const num = Number(value);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg">{spec.label}</span>
        <input
          type="number"
          inputMode="decimal"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= spec.min && v <= spec.max) onChange(v);
          }}
          onBlur={() => setText(String(value))}
          className="w-24 rounded-lg border border-line bg-surface-2 px-2 py-1 text-right text-sm text-fg tabular"
        />
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={Number.isFinite(num) ? num : spec.min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
        aria-label={spec.label}
      />
      {spec.help && <span className="block text-xs text-muted">{spec.help}</span>}
    </div>
  );
}

export function ParamEditor({
  def,
  market,
  custom,
  open,
  onClose,
  onApply,
}: {
  def: IndicatorDef | null;
  market: Market;
  custom: Params | null;
  open: boolean;
  onClose: () => void;
  onApply: (params: Params | null) => void;
}) {
  const [draft, setDraft] = useState<Params>({});
  useEffect(() => {
    if (def && open) setDraft(resolveParams(def, market, custom));
  }, [def, market, custom, open]);
  if (!def) return null;
  const marketDefault = resolveParams(def, market, null);
  return (
    <Sheet open={open} onClose={onClose} title={`${def.name} 參數`}>
      {def.presets && def.presets.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-medium text-fg">常用設定</h3>
          <div className="flex flex-wrap gap-2">
            {def.presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDraft({ ...draft, ...(p.values as Params) })}
                className="rounded-full border border-line px-3 py-1 text-xs text-fg hover:border-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-5">
        {def.params.map((spec) => (
          <ParamField
            key={spec.key}
            spec={spec}
            value={draft[spec.key] ?? def.defaults[spec.key]!}
            onChange={(v) => setDraft((d) => ({ ...d, [spec.key]: v }))}
          />
        ))}
      </div>
      <p className="mt-5 text-xs text-muted">
        「恢復預設」會使用{MARKET_LABELS[market]}常用的設定：
        {def.params.map((s) => `${s.label} ${Array.isArray(marketDefault[s.key]) ? (marketDefault[s.key] as number[]).join('/') : marketDefault[s.key]}`).join('、')}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            onApply(null);
            onClose();
          }}
          className="flex-1 rounded-lg border border-line px-4 py-2 text-sm text-fg"
        >
          恢復預設
        </button>
        <button
          type="button"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast"
        >
          套用
        </button>
      </div>
    </Sheet>
  );
}
