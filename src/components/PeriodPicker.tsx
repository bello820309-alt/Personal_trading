import type { PeriodPreset } from '../backtest/rankPeriods';
import { fmtDate } from '../data/format';
import { Segmented } from './ui';

function Chips({ items, activeKey, onPick, withDates }: { items: PeriodPreset[]; activeKey: string; onPick: (p: PeriodPreset) => void; withDates?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((p) => {
        const on = p.key === activeKey;
        return (
          <button
            key={p.key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(p)}
            className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${on ? 'border-accent bg-accent font-medium text-accent-contrast' : 'border-line bg-surface text-fg hover:bg-surface-2'}`}
          >
            {p.label}
            {withDates && <span className="ml-1 opacity-70">{`${fmtDate(p.from).slice(2)}～${fmtDate(p.to).slice(2)}`}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 選一段期間：最近幾年、單一年度、有名的大漲大跌行情（比特幣）、自訂日期 */
export function PeriodPicker({
  presets,
  activeKey,
  from,
  to,
  first,
  last,
  onPick,
  onCustom,
}: {
  presets: PeriodPreset[];
  activeKey: string;
  from: string;
  to: string;
  /** 資料的第一天、最後一天（自訂日期的範圍） */
  first: string;
  last: string;
  onPick: (p: PeriodPreset) => void;
  onCustom: (from: string, to: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Segmented<string>
        size="sm"
        ariaLabel="最近一段時間"
        value={activeKey}
        onChange={(k) => onPick(presets.find((x) => x.key === k)!)}
        options={presets.filter((x) => x.group === 'recent').map((x) => ({ value: x.key, label: x.label }))}
      />
      <div>
        <div className="mb-1.5 text-xs text-muted">單一年度</div>
        <Chips items={presets.filter((x) => x.group === 'year')} activeKey={activeKey} onPick={onPick} />
      </div>
      {presets.some((x) => x.group === 'phase') && (
        <div>
          <div className="mb-1.5 text-xs text-muted">有名的大漲／大跌行情（起訖日是那段期間收盤價的最高點或最低點）</div>
          <Chips items={presets.filter((x) => x.group === 'phase')} activeKey={activeKey} onPick={onPick} withDates />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">自訂</span>
        <input
          type="date"
          aria-label="開始日期"
          min={first}
          max={last}
          value={from}
          onChange={(e) => onCustom(e.target.value, to)}
          className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm text-fg"
        />
        <span className="text-muted">～</span>
        <input
          type="date"
          aria-label="結束日期"
          min={first}
          max={last}
          value={to}
          onChange={(e) => onCustom(from, e.target.value)}
          className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm text-fg"
        />
      </div>
    </div>
  );
}
