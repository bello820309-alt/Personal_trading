import { useEffect, useMemo, useState } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { DataTimeNote } from '../components/DataTimeNote';
import { PriceChart, type ChartIndicator, type ChartMarker } from '../components/chart/PriceChart';
import { buildEventMarkers } from '../components/chart/eventMarkers';
import { EventLegend } from '../components/EventLegend';
import { eventsFor } from '../data/events';
import { ExplainSheet } from '../components/ExplainSheet';
import { CloseIcon, InfoIcon, PlusIcon, SlidersIcon } from '../components/icons';
import { IndicatorPicker } from '../components/IndicatorPicker';
import { ArrowGuide, LineGuide } from '../components/LineGuide';
import { ParamEditor } from '../components/ParamEditor';
import { Card, Segmented, ToneBadge } from '../components/ui';
import { DEFAULT_ASSET_ID, getAsset, type AssetConfig } from '../config/assets';
import { fmtBarDate, fmtPct, fmtPrice, signClass } from '../data/format';
import { useAsset, useExtra } from '../data/load';
import { TIMEFRAME_LABELS, type Timeframe } from '../data/resample';
import type { AssetSeries, Candle } from '../data/types';
import { barsForRange, useDisplayCandles } from '../data/useSeries';
import { computeIndicator, describeOf, getIndicator, signalsOf, supportsAsset, type ComputedIndicator } from '../indicators/registry';
import type { Signal } from '../indicators/types';
import { Link, navigate, withQuery } from '../router';
import { RANGE_LABELS, useSettings, type RangeKey } from '../store/settings';

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

function ChartView({ asset, series }: { asset: AssetConfig; series: AssetSeries }) {
  const s = useSettings();
  const candles = useDisplayCandles(series, s.adjusted, s.timeframe);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [explainId, setExplainId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // 比特幣的額外資料（情緒、合約、鏈上）；比特幣專屬的指標換到股票時不顯示
  const extra = useExtra(asset.id);
  const ctx = useMemo(() => ({ extra }), [extra]);
  const computed = useMemo<ComputedIndicator[]>(
    () =>
      s.chartIndicators.flatMap((ci) => {
        const def = getIndicator(ci.id);
        return def && supportsAsset(def, asset.id) ? [computeIndicator(def, candles, asset.market, ci.params, ctx)] : [];
      }),
    [candles, s.chartIndicators, asset.market, asset.id, ctx],
  );

  const chartIndicators = useMemo<ChartIndicator[]>(
    () => computed.map((c) => ({ key: c.def.id, title: c.def.shortName, result: c.result, placement: c.def.placement })),
    [computed],
  );

  const withSignals = computed.filter((c) => c.def.signals);
  const signalCi =
    s.signalIndicator === 'none'
      ? undefined
      : (withSignals.find((c) => c.def.id === s.signalIndicator) ?? withSignals[0]);
  const signals = useMemo(() => (signalCi ? signalsOf(signalCi, candles) : []), [signalCi, candles]);
  const markers = useMemo<ChartMarker[]>(() => signals.map((x) => ({ index: x.index, side: x.side })), [signals]);

  const events = useMemo(() => eventsFor(asset.id), [asset.id]);
  const eventMarks = useMemo(() => (s.showEvents ? buildEventMarkers(candles, events) : null), [s.showEvents, candles, events]);
  const eventGroups = useMemo(
    () => (['hike', 'cut', 'election', 'halving', 'crypto', 'macro'] as const).filter((g) => events.some((e) => e.group === g)),
    [events],
  );

  const visibleBars = barsForRange(candles, s.range);
  const rangeKey = `${asset.id}|${s.timeframe}|${s.range}`;

  const n = candles.length;
  const last = candles[n - 1]!;
  const lastPrev = candles[n - 2];
  const lastChange = lastPrev ? last.close / lastPrev.close - 1 : null;
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
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <DataTimeNote series={series} />
            {s.timeframe !== 'D' && (
              <span>
                ・最新一根{TIMEFRAME_LABELS[s.timeframe]}：{fmtBarDate(last.time, last.endTime)}
              </span>
            )}
            {s.adjusted && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">還原權息</span>}
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
        <label className="inline-flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={s.showEvents} onChange={(e) => s.update({ showEvents: e.target.checked })} />
          標示消息面事件
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

      <PriceChart
        candles={candles}
        asset={asset}
        indicators={chartIndicators}
        markers={markers}
        visibleBars={visibleBars}
        rangeKey={rangeKey}
        onExplain={setExplainId}
        measurable
        barUnit={TIMEFRAME_LABELS[s.timeframe]}
        lastBarComplete={series.meta.lastBarComplete}
        eventMarkers={eventMarks?.markers}
        eventNotes={eventMarks?.notes}
      />
      {eventMarks && (
        <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <EventLegend groups={eventGroups} />
          <Link to={withQuery('/backtest/events', { asset: asset.id })} className="text-xs text-accent">
            事件前後的統計 →
          </Link>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted">
        小技巧：圖裡每個區塊的左上角會標出線的名稱、顏色和數值；手指按住圖表左右移動，可以看每一天的數值，點名稱可以看解說。兩指可以縮放。按圖表右上方的「區間漲跌」，再點兩根 K 棒（例如 10/1 和 11/1），就能看到這段期間漲跌多少。圖上的箭頭是所選指標的經典訊號，不是投資建議。
        {asset.historyNote ? ` ${asset.historyNote}` : ''}
      </p>

      <ReadingGuide
        computed={computed}
        candles={candles}
        timeframe={s.timeframe}
        signalId={signalCi?.def.id ?? null}
        signals={signals}
        onExplain={setExplainId}
      />

      {signalCi && <SignalList ci={signalCi} candles={candles} asset={asset} timeframe={s.timeframe} />}

      <IndicatorPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        assetId={asset.id}
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

/** 「怎麼看這張圖」：每個指標的線代表什麼、箭頭代表什麼、現在是什麼狀態 */
function ReadingGuide({
  computed,
  candles,
  timeframe,
  signalId,
  signals,
  onExplain,
}: {
  computed: ComputedIndicator[];
  candles: Candle[];
  timeframe: Timeframe;
  signalId: string | null;
  signals: Signal[];
  onExplain: (id: string) => void;
}) {
  const panes = computed.filter((c) => c.def.placement === 'pane');
  const barUnit = timeframe === 'W' ? '週' : timeframe === 'M' ? '個月' : undefined;
  return (
    <Card>
      <h2 className="text-base font-semibold text-fg">怎麼看這張圖</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted">下面每個顏色樣本都和圖上的線一樣，對照著看就知道哪條是哪條。</p>
      {barUnit && (
        <p className="mb-4 rounded-lg border border-hot/40 bg-hot/10 px-3 py-2 text-sm leading-relaxed text-fg">
          現在看的是{TIMEFRAME_LABELS[timeframe]}：一根 K 棒代表一{barUnit === '週' ? '週' : '個月'}，所以指標用的「天數」在這裡都是「{barUnit}數」。例如
          MACD 的 12、26，在這張圖上是 12 {barUnit}、26 {barUnit}；下面「現在」的說明裡的「今天」，指的是最新這一根 K 棒。
        </p>
      )}
      {computed.length === 0 ? (
        <p className="text-sm text-muted">還沒有加入指標。按「加入指標」挑幾個來看看吧。</p>
      ) : (
        <ul className="space-y-5">
          {computed.map((c) => {
            const d = describeOf(c, candles);
            const paneNo = panes.indexOf(c) + 1;
            const where =
              c.def.placement === 'overlay'
                ? '畫在 K 線上的線'
                : panes.length > 1
                  ? `K 線下方第 ${paneNo} 個小圖裡的線`
                  : 'K 線下方小圖裡的線';
            return (
              <li key={c.def.id} className="border-b border-line pb-5 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-fg">{c.def.name}</span>
                  {c.def.shortName !== c.def.name && <span className="text-sm text-muted">{c.def.shortName}</span>}
                  <button type="button" onClick={() => onExplain(c.def.id)} className="ml-auto shrink-0 text-xs text-accent">
                    看解說
                  </button>
                </div>
                <h3 className="mt-2 mb-1.5 text-xs font-medium text-muted">{where}</h3>
                <LineGuide def={c.def} result={c.result} barUnit={barUnit} />
                {c.def.id === signalId && signals.length > 0 && (
                  <>
                    <h3 className="mt-3 mb-1.5 text-xs font-medium text-muted">圖上的箭頭</h3>
                    <ArrowGuide signals={signals} />
                  </>
                )}
                <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2">
                  {d ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <ToneBadge tone={d.tone} />
                        <span className="text-sm font-medium text-fg">現在：{d.headline}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{d.detail}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted">資料不夠長，還算不出目前的狀態。</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
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
                    <td className="py-1.5 pr-2 text-fg">{fmtBarDate(c.time, c.endTime)}</td>
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

