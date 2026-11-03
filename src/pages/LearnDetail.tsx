import { useMemo, type ReactNode } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { PriceChart, type ChartIndicator, type ChartMarker } from '../components/chart/PriceChart';
import { ArrowGuide, LineGuide } from '../components/LineGuide';
import { Notice, Spinner, ToneBadge } from '../components/ui';
import { ASSETS, DEFAULT_ASSET_ID, getAsset, type AssetConfig } from '../config/assets';
import { defaultCosts, runIndicatorBacktest } from '../backtest/strategies';
import { getContent } from '../content';
import { lastDate } from '../data/extra';
import { fmtDate, fmtNum, fmtPct } from '../data/format';
import { useAsset, useAssets, useExtra } from '../data/load';
import type { AssetSeries } from '../data/types';
import { barsForRange } from '../data/useSeries';
import { INDICATORS, computeIndicator, describeOf, getIndicator, hasRequiredData, signalsOf, supportsAsset } from '../indicators/registry';
import { CATEGORY_LABELS, type IndicatorDef } from '../indicators/types';
import { Link, navigate, useLocation, withQuery } from '../router';
import { useSettings } from '../store/settings';
import { NotFound } from './NotFound';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 md:p-5">
      <h2 className="mb-2 text-base font-semibold text-fg">{title}</h2>
      <div className="text-sm leading-relaxed text-fg">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export function LearnDetail({ id }: { id: string }) {
  const def = getIndicator(id);
  const c = getContent(id);
  const { query } = useLocation();
  const lastAsset = useSettings((s) => s.lastAsset);
  if (!def || !c) return <NotFound />;
  const picked = getAsset(query.get('asset')) ?? getAsset(lastAsset) ?? getAsset(DEFAULT_ASSET_ID)!;
  // 比特幣專屬的指標（情緒、合約、鏈上）一律用比特幣示範
  const asset = supportsAsset(def, picked.id) ? picked : getAsset(def.assets![0])!;
  const idx = INDICATORS.findIndex((d) => d.id === def.id);
  const prev = INDICATORS[idx - 1];
  const next = INDICATORS[idx + 1];

  return (
    <article className="space-y-4">
      <nav className="text-sm text-muted">
        <Link to="/learn" className="text-accent">
          指標百科
        </Link>
        <span className="mx-1.5">/</span>
        {CATEGORY_LABELS[def.category]}
      </nav>
      <header>
        <h1 className="text-2xl font-bold text-fg">
          {def.name}
          {def.shortName !== def.name && <span className="ml-2 text-lg font-medium text-muted">{def.shortName}</span>}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{def.enName}</p>
        <p className="mt-3 text-lg leading-relaxed text-fg">{c.oneLiner}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">{c.kind.timing}</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">適合：{c.kind.bestFor}</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">{def.placement === 'overlay' ? '畫在 K 線上' : '畫在獨立的副圖'}</span>
        </div>
      </header>

      <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-fg">
        <span className="font-semibold">打個比方：</span>
        {c.analogy}
      </div>

      <Section title="原理：它在看什麼？">
        <div className="space-y-2">
          {c.principle.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </Section>

      <Section title="怎麼計算">
        <ol className="list-decimal space-y-2 pl-5">
          {c.steps.map((s) => (
            <li key={s.text}>
              {s.text}
              {s.formula && <div className="formula mt-1 rounded-md bg-surface-2 px-3 py-2 text-fg">{s.formula}</div>}
            </li>
          ))}
        </ol>
        {c.example && (
          <div className="mt-3 rounded-lg border border-line px-3 py-2">
            <div className="mb-1 text-xs font-semibold text-muted">小例子</div>
            {c.example.map((e) => (
              <div key={e} className="formula text-fg">
                {e}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="怎麼看">
        <ul className="space-y-2">
          {c.howToRead.map((h) => (
            <li key={h.title}>
              <span className="font-semibold">{h.title}：</span>
              {h.text}
            </li>
          ))}
        </ul>
      </Section>

      <LiveExample def={def} asset={asset} />

      <Section title="用途">
        <Bullets items={c.uses} />
      </Section>

      <Section title="限制與常見誤區">
        <Bullets items={c.pitfalls} />
      </Section>

      <Section title="參數說明">
        <ul className="space-y-1.5">
          {c.params.map((p) => (
            <li key={p.name}>
              <span className="font-semibold">{p.name}：</span>
              {p.text}
            </li>
          ))}
        </ul>
        <h3 className="mt-3 mb-1 font-semibold">各市場常用設定</h3>
        <Bullets items={c.marketNotes} />
      </Section>

      <Section title="常見搭配">
        <Bullets items={c.combineWith} />
      </Section>

      <Section title="回測這個規則">
        {def.strategy ? (
          <>
            <p>
              <span className="font-semibold text-up">買：</span>
              {def.strategy.buyRule}
              <br />
              <span className="font-semibold text-down">賣：</span>
              {def.strategy.sellRule}
            </p>
            <BacktestSummary def={def} />
            <Link
              to={withQuery('/backtest', { asset: asset.id, strategy: def.id })}
              className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast"
            >
              自己調整參數、期間來回測 →
            </Link>
          </>
        ) : (
          <p className="text-muted">{def.noSignalReason}</p>
        )}
      </Section>

      <nav className="flex justify-between gap-3 pt-2 text-sm">
        {prev ? (
          <Link to={`/learn/${prev.id}`} className="text-accent">
            ← {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/learn/${next.id}`} className="text-right text-accent">
            {next.name} →
          </Link>
        )}
      </nav>
    </article>
  );
}

function LiveExample({ def, asset }: { def: IndicatorDef; asset: AssetConfig }) {
  const state = useAsset(asset.id);
  return (
    <Section title="實際看看（真實資料，最近一年）">
      <div className="mb-3">
        {def.assets ? (
          <p className="text-sm text-muted">這個指標的資料只有{def.assets.map((id) => getAsset(id)?.name ?? id).join('、')}有，所以用{asset.name}示範。</p>
        ) : (
          <AssetTabs value={asset.id} onChange={(id) => navigate(withQuery(`/learn/${def.id}`, { asset: id }), { replace: true })} />
        )}
      </div>
      {state.status === 'ready' ? <LiveChart def={def} asset={asset} series={state.data} /> : <AssetStateView state={state} name={asset.name} />}
    </Section>
  );
}

function LiveChart({ def, asset, series }: { def: IndicatorDef; asset: AssetConfig; series: AssetSeries }) {
  const addIndicator = useSettings((s) => s.addIndicator);
  const update = useSettings((s) => s.update);
  const candles = series.candles;
  const extra = useExtra(asset.id);
  const ci = useMemo(() => computeIndicator(def, candles, asset.market, null, { extra }), [def, candles, asset.market, extra]);
  const sources = (def.requires ?? []).flatMap((k) => {
    const s = extra?.series[k];
    return s ? [`${s.label}：${s.source}，資料到 ${fmtDate(lastDate(s))}`] : [];
  });
  const indicators = useMemo<ChartIndicator[]>(
    () => [{ key: def.id, title: def.shortName, result: ci.result, placement: def.placement }],
    [ci, def],
  );
  const signals = useMemo(() => signalsOf(ci, candles), [ci, candles]);
  const markers = useMemo<ChartMarker[]>(() => signals.map((s) => ({ index: s.index, side: s.side })), [signals]);
  const d = describeOf(ci, candles);
  return (
    <div>
      <PriceChart
        candles={candles}
        asset={asset}
        indicators={indicators}
        markers={markers}
        visibleBars={barsForRange(candles, '1Y')}
        rangeKey={`learn|${def.id}|${asset.id}`}
        compact
      />
      <div className="mt-3">
        <h3 className="mb-1.5 text-xs font-medium text-muted">{def.placement === 'overlay' ? '畫在 K 線上的線' : 'K 線下方小圖裡的線'}</h3>
        <LineGuide def={def} result={ci.result} />
        {signals.length > 0 && (
          <>
            <h3 className="mt-3 mb-1.5 text-xs font-medium text-muted">圖上的箭頭</h3>
            <ArrowGuide signals={signals} />
          </>
        )}
      </div>
      {sources.length > 0 && <p className="mt-2 text-xs leading-relaxed text-muted">資料來源：{sources.join('；')}（每天由 GitHub Actions 更新）。</p>}
      {d && (
        <div className="mt-3 rounded-lg border border-line px-3 py-2">
          <div className="flex items-center gap-2">
            <ToneBadge tone={d.tone} />
            <span className="font-medium">{asset.name}現在：{d.headline}</span>
          </div>
          <p className="mt-1 text-muted">{d.detail}</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          addIndicator(def.id);
          if (def.signals) update({ signalIndicator: def.id });
          navigate(`/chart/${asset.id}`);
        }}
        className="mt-3 text-sm text-accent"
      >
        在圖表頁加入這個指標 →
      </button>
    </div>
  );
}

/** 三個標的「近 10 年」的回測摘要（預設參數、預設成本） */
function BacktestSummary({ def }: { def: IndicatorDef }) {
  // 比特幣專屬的指標只回測比特幣，而且要等額外資料載入
  const assets = ASSETS.filter((a) => supportsAsset(def, a.id));
  const states = useAssets(assets.map((a) => a.id));
  const extra = useExtra(def.requires ? 'BTC' : undefined);
  const rows = useMemo(
    () =>
      assets.map((asset) => {
        const st = states[asset.id];
        const ctx = { extra: asset.extraData ? extra : null };
        if (!st || st.status !== 'ready' || !hasRequiredData(def, ctx)) return { asset, res: null, status: st?.status === 'ready' ? 'loading' : (st?.status ?? 'loading') };
        return { asset, res: runIndicatorBacktest(st.data, asset, def, null, '10Y', defaultCosts(asset), ctx), status: 'ready' };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [states, def, extra],
  );
  if (rows.every((r) => r.status === 'loading')) return <Spinner label="正在計算回測…" />;
  if (rows.every((r) => r.status !== 'ready' && r.status !== 'loading')) {
    return <Notice tone="warn">還沒有行情資料，資料抓取完成後就能看到回測結果。</Notice>;
  }
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-muted">近 10 年（不足 10 年用全部資料），使用預設參數與交易成本：</p>
      <div className="table-scroll">
        <table className="w-full min-w-[480px] text-sm tabular">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 pr-2 text-left font-normal">標的</th>
              <th className="py-1 pr-2 text-right font-normal">策略年化</th>
              <th className="py-1 pr-2 text-right font-normal">持有年化</th>
              <th className="py-1 pr-2 text-right font-normal">策略最大回撤</th>
              <th className="py-1 pr-2 text-right font-normal">持有最大回撤</th>
              <th className="py-1 text-right font-normal">交易／勝率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ asset, res }) => (
              <tr key={asset.id} className="border-t border-line">
                <td className="py-1.5 pr-2 text-fg">{asset.shortName}</td>
                {res ? (
                  <>
                    <td className="py-1.5 pr-2 text-right text-fg">{fmtPct(res.metrics.cagr)}</td>
                    <td className="py-1.5 pr-2 text-right text-muted">{fmtPct(res.benchmarkMetrics.cagr)}</td>
                    <td className="py-1.5 pr-2 text-right text-fg">−{fmtNum(res.metrics.maxDrawdown * 100, 1)}%</td>
                    <td className="py-1.5 pr-2 text-right text-muted">−{fmtNum(res.benchmarkMetrics.maxDrawdown * 100, 1)}%</td>
                    <td className="py-1.5 text-right text-fg">
                      {res.stats.closedCount} 筆／{fmtPct(res.stats.winRate, 0, false)}
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className="py-1.5 text-right text-muted">
                    沒有資料
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">年化報酬比買進持有低很常見，但有些策略能明顯降低最大回撤；要看你比較在意哪一個。</p>
    </div>
  );
}
