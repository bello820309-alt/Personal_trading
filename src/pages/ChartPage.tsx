import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { PriceChart, resolveColor, type ChartIndicator, type ChartMarker } from '../components/chart/PriceChart';
import { ExplainSheet } from '../components/ExplainSheet';
import { CloseIcon, InfoIcon, PlusIcon, SlidersIcon } from '../components/icons';
import { IndicatorPicker } from '../components/IndicatorPicker';
import { ParamEditor } from '../components/ParamEditor';
import { Card, Segmented, ToneBadge } from '../components/ui';
import { DEFAULT_ASSET_ID, getAsset, type AssetConfig } from '../config/assets';
import { fmtAuto, fmtDate, fmtNum, fmtPct, fmtPrice, fmtVolume, signClass } from '../data/format';
import { useAsset } from '../data/load';
import { TIMEFRAME_LABELS, type Timeframe } from '../data/resample';
import type { AssetSeries, Candle } from '../data/types';
import { barsForRange, useDisplayCandles } from '../data/useSeries';
import { computeIndicator, describeOf, getIndicator, signalsOf, type ComputedIndicator } from '../indicators/registry';
import type { LineOutput } from '../indicators/types';
import { Link, navigate, withQuery } from '../router';
import { RANGE_LABELS, useResolvedTheme, useSettings, type RangeKey } from '../store/settings';
import { getChartTheme } from '../theme';

export function ChartPage({ assetId }: { assetId?: string }) {
  const lastAsset = useSettings((s) => s.lastAsset);
  const update = useSettings((s) => s.update);
  const asset = getAsset(assetId) ?? getAsset(lastAsset) ?? getAsset(DEFAULT_ASSET_ID)!;
  useEffect(() => {
    if (asset.id !== lastAsset) update({ lastAsset: asset.id });
  }, [asset.id, lastAsset, update]);
  const state = useAsset(asset.id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-fg md:text-2xl">圖表</h1>
        <AssetTabs value={asset.id} onChange={(id) => navigate(`/chart/${id}`)} />
      </div>
      {state.status === 'ready' ? <ChartView key={asset.id} asset={asset} series={state.data} /> : <AssetStateView state={state} name={asset.name} />}
    </div>
  );
}

function lineValueAt(line: LineOutput, index: number): number | null {
  const v = line.values[index - (line.shift ?? 0)];
  return v === undefined ? null : v;
}

function formatLineValue(v: number | null, line: LineOutput, asset: AssetConfig): string {
  if (v === null) return '—';
  if (line.unit === 'volume') return fmtVolume(v, asset);
  if (line.unit === 'percent') return `${fmtNum(v, 2)}%`;
  return fmtAuto(v);
}

function ChartView({ asset, series }: { asset: AssetConfig; series: AssetSeries }) {
  const s = useSettings();
  const theme = useResolvedTheme();
  const chartTheme = getChartTheme(theme, s.colorMode);
  const candles = useDisplayCandles(series, s.adjusted, s.timeframe);
  const [hover, setHover] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [explainId, setExplainId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const computed = useMemo<ComputedIndicator[]>(
    () =>
      s.chartIndicators.flatMap((ci) => {
        const def = getIndicator(ci.id);
        return def ? [computeIndicator(def, candles, asset.market, ci.params)] : [];
      }),
    [candles, s.chartIndicators, asset.market],
  );

  const chartIndicators = useMemo<ChartIndicator[]>(
    () => computed.map((c) => ({ key: c.def.id, result: c.result, placement: c.def.placement })),
    [computed],
  );

  const withSignals = computed.filter((c) => c.def.signals);
  const signalCi =
    s.signalIndicator === 'none'
      ? undefined
      : (withSignals.find((c) => c.def.id === s.signalIndicator) ?? withSignals[0]);
  const signals = useMemo(() => (signalCi ? signalsOf(signalCi, candles) : []), [signalCi, candles]);
  const markers = useMemo<ChartMarker[]>(() => signals.map((x) => ({ index: x.index, side: x.side })), [signals]);

  const visibleBars = barsForRange(candles, s.range);
  const rangeKey = `${asset.id}|${s.timeframe}|${s.range}`;
  const onHover = useCallback((i: number | null) => setHover(i), []);

  const n = candles.length;
  const idx = hover ?? n - 1;
  const bar = candles[idx];
  const prev = idx > 0 ? candles[idx - 1] : undefined;
  const last = candles[n - 1]!;
  const lastPrev = candles[n - 2];
  const lastChange = lastPrev ? last.close / lastPrev.close - 1 : null;
  const unfinished = !series.meta.lastBarComplete;
  const editing = computed.find((c) => c.def.id === editId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm text-muted">
            {asset.name}（{asset.symbol}）· {asset.currency}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-fg tabular">{fmtPrice(last.close, asset)}</span>
            <span className={`text-base font-medium tabular ${signClass(lastChange)}`}>{fmtPct(lastChange)}</span>
          </div>
          <div className="text-xs text-muted">
            {fmtDate(last.time)} {s.timeframe === 'D' ? '收盤' : `${TIMEFRAME_LABELS[s.timeframe]}`}
            {unfinished && <span className="ml-2 rounded bg-hot/15 px-1.5 py-0.5 text-hot">尚未收盤</span>}
            {s.adjusted && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-accent">還原權息</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Timeframe>
          size="sm"
          ariaLabel="K 線週期"
          value={s.timeframe}
          onChange={(v) => s.update({ timeframe: v })}
          options={(['D', 'W', 'M'] as const).map((v) => ({ value: v, label: TIMEFRAME_LABELS[v] }))}
        />
        <Segmented<RangeKey>
          size="sm"
          ariaLabel="顯示區間"
          value={s.range}
          onChange={(v) => s.update({ range: v })}
          options={(['3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const).map((v) => ({ value: v, label: RANGE_LABELS[v] }))}
        />
        <label className="inline-flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={s.adjusted} onChange={(e) => s.update({ adjusted: e.target.checked })} />
          還原權息
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {computed.map((c) => (
          <span key={c.def.id} className="inline-flex items-center rounded-full border border-line bg-surface text-sm">
            <button
              type="button"
              onClick={() => setExplainId(c.def.id)}
              className="inline-flex items-center gap-1 py-1 pr-1 pl-3 text-fg"
              aria-label={`${c.def.name} 解說`}
            >
              {c.def.shortName}
              <InfoIcon className="text-muted" width={15} height={15} />
            </button>
            <button type="button" onClick={() => setEditId(c.def.id)} className="p-1 text-muted hover:text-fg" aria-label={`調整 ${c.def.name} 參數`}>
              <SlidersIcon width={15} height={15} />
            </button>
            <button
              type="button"
              onClick={() => s.removeIndicator(c.def.id)}
              className="py-1 pr-2 pl-1 text-muted hover:text-fg"
              aria-label={`移除 ${c.def.name}`}
            >
              <CloseIcon width={15} height={15} />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-contrast"
        >
          <PlusIcon width={15} height={15} />
          加入指標
        </button>
      </div>

      {withSignals.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
          圖上標示訊號：
          <select
            value={signalCi?.def.id ?? 'none'}
            onChange={(e) => s.update({ signalIndicator: e.target.value })}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-fg"
          >
            {withSignals.map((c) => (
              <option key={c.def.id} value={c.def.id}>
                {c.def.name}
              </option>
            ))}
            <option value="none">不標示</option>
          </select>
        </label>
      )}

      {/* 數值圖例：電腦版放在圖表上方，手機版放在圖表下方，讓圖表在第一屏就看得到 */}
      {bar && (
        <div className="hidden md:block">
          <Legend asset={asset} bar={bar} prev={prev} computed={computed} index={idx} colorOf={(l) => resolveColor(chartTheme, l.color)} />
        </div>
      )}

      <PriceChart
        candles={candles}
        asset={asset}
        indicators={chartIndicators}
        markers={markers}
        visibleBars={visibleBars}
        rangeKey={rangeKey}
        onHover={onHover}
      />

      {bar && (
        <div className="md:hidden">
          <Legend asset={asset} bar={bar} prev={prev} computed={computed} index={idx} colorOf={(l) => resolveColor(chartTheme, l.color)} />
        </div>
      )}
      <p className="text-xs text-muted">
        小技巧：手機用兩指縮放、左右滑動；點一下圖表可以看當天的數值。圖上的「買」「賣」是所選指標的經典訊號，不是投資建議。
        {asset.historyNote ? ` ${asset.historyNote}` : ''}
      </p>

      {signalCi && <SignalList ci={signalCi} candles={candles} asset={asset} timeframe={s.timeframe} />}

      <Card>
        <h2 className="mb-3 text-base font-semibold text-fg">這些指標目前怎麼說</h2>
        {computed.length === 0 ? (
          <p className="text-sm text-muted">還沒有加入指標。按「加入指標」挑幾個來看看吧。</p>
        ) : (
          <ul className="space-y-3">
            {computed.map((c) => {
              const d = describeOf(c, candles);
              return (
                <li key={c.def.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    {d && <ToneBadge tone={d.tone} />}
                    <span className="text-sm font-medium text-fg">{c.def.name}</span>
                    <button type="button" onClick={() => setExplainId(c.def.id)} className="ml-auto text-xs text-accent">
                      看解說
                    </button>
                  </div>
                  {d ? (
                    <>
                      <p className="mt-1 text-sm text-fg">{d.headline}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">{d.detail}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted">資料不夠長，還算不出來。</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <IndicatorPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        activeIds={s.chartIndicators.map((x) => x.id)}
        onAdd={s.addIndicator}
        onRemove={s.removeIndicator}
      />
      <ExplainSheet id={explainId} onClose={() => setExplainId(null)} />
      <ParamEditor
        def={editing?.def ?? null}
        market={asset.market}
        custom={s.chartIndicators.find((x) => x.id === editId)?.params ?? null}
        open={!!editing}
        onClose={() => setEditId(null)}
        onApply={(p) => editId && s.setIndicatorParams(editId, p)}
      />
    </div>
  );
}

function Legend({
  asset,
  bar,
  prev,
  computed,
  index,
  colorOf,
}: {
  asset: AssetConfig;
  bar: Candle;
  prev: Candle | undefined;
  computed: ComputedIndicator[];
  index: number;
  colorOf: (l: LineOutput) => string;
}) {
  const chg = prev ? bar.close / prev.close - 1 : null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs tabular">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="font-medium text-fg">{fmtDate(bar.time)}</span>
        <span className="text-muted">
          開 <span className="text-fg">{fmtPrice(bar.open, asset)}</span>
        </span>
        <span className="text-muted">
          高 <span className="text-fg">{fmtPrice(bar.high, asset)}</span>
        </span>
        <span className="text-muted">
          低 <span className="text-fg">{fmtPrice(bar.low, asset)}</span>
        </span>
        <span className="text-muted">
          收 <span className="text-fg">{fmtPrice(bar.close, asset)}</span>
        </span>
        <span className={signClass(chg)}>{fmtPct(chg)}</span>
        <span className="text-muted">
          {asset.volume.label} <span className="text-fg">{fmtVolume(bar.volume, asset)}</span>
        </span>
      </div>
      {computed.map((c) => {
        const lines = c.result.lines.filter((l) => l.key !== 'trend');
        if (lines.length === 0) return null;
        const showName = lines[0]!.label !== c.def.shortName;
        return (
          <div key={c.def.id} className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {showName && <span className="text-muted">{c.def.shortName}</span>}
            {lines.map((l) => (
              <span key={l.key} className="inline-flex items-center gap-1 text-muted">
                {!l.hidden && <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorOf(l) }} />}
                {l.label} <span className="text-fg">{formatLineValue(lineValueAt(l, index), l, asset)}</span>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SignalList({
  ci,
  candles,
  asset,
  timeframe,
}: {
  ci: ComputedIndicator;
  candles: Candle[];
  asset: AssetConfig;
  timeframe: Timeframe;
}) {
  const sigs = signalsOf(ci, candles);
  const after = timeframe === 'D' ? 20 : timeframe === 'W' ? 4 : 1;
  const unit = timeframe === 'D' ? '個交易日' : timeframe === 'W' ? '週' : '個月';
  const recent = sigs.slice(-8).reverse();
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{ci.def.name}：最近的訊號</h2>
        <Link to={withQuery('/backtest', { asset: asset.id, strategy: ci.def.id })} className="text-sm text-accent">
          回測這個規則 →
        </Link>
      </div>
      {ci.def.strategy && (
        <p className="mb-3 text-sm leading-relaxed text-muted">
          買：{ci.def.strategy.buyRule}
          <br />
          賣：{ci.def.strategy.sellRule}
        </p>
      )}
      {recent.length === 0 ? (
        <p className="text-sm text-muted">這段資料裡沒有出現訊號。</p>
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[420px] text-sm tabular">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal">日期</th>
                <th className="py-1 pr-2 font-normal">訊號</th>
                <th className="py-1 pr-2 text-right font-normal">收盤價</th>
                <th className="py-1 text-right font-normal">
                  之後 {after} {unit}
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((x) => {
                const c = candles[x.index]!;
                const later = candles[x.index + after];
                const move = later ? later.close / c.close - 1 : null;
                return (
                  <tr key={x.index} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-fg">{fmtDate(c.time)}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-xs ${x.side === 'buy' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                        {x.side === 'buy' ? '買' : '賣'}
                      </span>
                      <span className="text-fg">{x.label}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-fg">{fmtPrice(c.close, asset)}</td>
                    <td className={`py-1.5 text-right ${signClass(move)}`}>{move === null ? '還沒到' : fmtPct(move)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">「之後漲跌」只是讓你觀察訊號出現後發生了什麼；單看幾次結果很容易被運氣誤導，完整統計請用回測。</p>
    </Card>
  );
}

