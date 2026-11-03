import { Link, withQuery } from '../router';

/** 回測頁上方的切換：策略排行榜／單一策略回測／消息面／動態定投 */
export function BacktestTabs({ active, assetId }: { active: 'rank' | 'single' | 'events' | 'dca'; assetId: string }) {
  const items = [
    { key: 'rank', to: withQuery('/backtest/rank', { asset: assetId }), label: '策略排行榜' },
    { key: 'single', to: withQuery('/backtest', { asset: assetId }), label: '單一策略' },
    { key: 'events', to: withQuery('/backtest/events', { asset: assetId }), label: '消息面' },
    { key: 'dca', to: withQuery('/backtest/dca', { asset: assetId }), label: '動態定投' },
  ] as const;
  return (
    <nav aria-label="回測方式" className="mb-4 inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-0.5">
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Link
            key={it.key}
            to={it.to}
            aria-current={on ? 'page' : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${on ? 'bg-accent font-medium text-accent-contrast' : 'text-muted hover:text-fg'}`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
