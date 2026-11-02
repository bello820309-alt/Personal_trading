import { memo, useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  createChart,
  createSeriesMarkers,
  type HistogramData,
  type ISeriesApi,
  type LineData,
  type LogicalRange,
  type MouseEventParams,
  type PriceFormat,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type WhitespaceData,
} from 'lightweight-charts';
import type { AssetConfig } from '../../config/assets';
import type { Candle } from '../../data/types';
import { fmtBarDate, fmtCompact, fmtPct, fmtPrice, signClass } from '../../data/format';
import { futureDates } from '../../data/resample';
import type { ColorRole, IndicatorResult, LineOutput, Series } from '../../indicators/types';
import { useResolvedTheme, useSettings } from '../../store/settings';
import { getChartTheme, withAlpha, type ChartTheme } from '../../theme';
import { BandFill, type BandPoint } from './bandFill';
import { formatLineValue, lineColorAt, lineValueAt, orderedLines } from './legend';

export interface ChartIndicator {
  /** 指標 id（點圖例標題時傳給 onExplain） */
  key: string;
  /** 圖例上顯示的名稱，例如 MACD、KD */
  title: string;
  result: IndicatorResult;
  placement: 'overlay' | 'pane';
}

export interface ChartMarker {
  index: number;
  side: 'buy' | 'sell';
  text?: string;
}

interface Props {
  candles: Candle[];
  asset: AssetConfig;
  indicators: ChartIndicator[];
  markers?: ChartMarker[];
  /** 一開始顯示最後幾根 K 棒 */
  visibleBars: number;
  /** 這個值改變時重設可視範圍（切換標的、週期、區間）；其他變動會保留使用者縮放的位置 */
  rangeKey: string;
  compact?: boolean;
  /** 點圖例上的指標名稱時呼叫（例如打開解說） */
  onExplain?: (key: string) => void;
}

interface PaneBox {
  top: number;
  height: number;
}

function sameBoxes(a: PaneBox[], b: PaneBox[]): boolean {
  return a.length === b.length && a.every((x, i) => Math.abs(x.top - b[i]!.top) < 0.5 && Math.abs(x.height - b[i]!.height) < 0.5);
}

export function resolveColor(t: ChartTheme, role: ColorRole): string {
  switch (role) {
    case 'up':
      return t.up;
    case 'down':
      return t.down;
    case 'accent':
      return t.accent;
    case 'hot':
      return t.hot;
    case 'cold':
      return t.cold;
    case 'muted':
      return t.textMuted;
    default:
      return t.series[Number(role.slice(1))] ?? t.accent;
  }
}

function useIsMobile(): boolean {
  const query = '(max-width: 767px)';
  const [m, setM] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(query);
    } catch {
      return;
    }
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function candlePriceFormat(asset: AssetConfig): PriceFormat {
  return asset.market === 'crypto'
    ? { type: 'price', precision: 0, minMove: 1 }
    : { type: 'price', precision: asset.pricePrecision, minMove: 1 / 10 ** asset.pricePrecision };
}

/** 副圖座標軸的數字格式：比特幣的數值很大就不顯示小數，0～100 的擺盪指標顯示 1 位小數 */
function panePriceFormat(line: LineOutput, asset: AssetConfig, fixedScale: boolean): PriceFormat {
  if (line.unit === 'volume') {
    return { type: 'custom', minMove: 1, formatter: (v: number) => fmtCompact(v / asset.volume.divisor) };
  }
  if (line.unit === 'percent') return { type: 'price', precision: 2, minMove: 0.01 };
  if (fixedScale) return { type: 'price', precision: 1, minMove: 0.1 };
  if (asset.market === 'crypto') return { type: 'price', precision: 0, minMove: 1 };
  return { type: 'price', precision: 2, minMove: 0.01 };
}

/** 圖例裡代表一條線的小色塊（線、柱子、點的樣子不同） */
function Swatch({ line, color }: { line: LineOutput; color: string }) {
  if (line.kind === 'histogram') return <span className="inline-block h-2.5 w-1.5 shrink-0 rounded-[1px]" style={{ background: color }} />;
  if (line.kind === 'dots') return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />;
  return (
    <span
      className="inline-block w-3 shrink-0"
      style={{ borderTop: `${line.width && line.width > 1 ? 2 : 1.5}px ${line.dashed ? 'dashed' : 'solid'} ${color}` }}
    />
  );
}

function IndicatorLegend({
  ci,
  index,
  t,
  asset,
  onExplain,
}: {
  ci: ChartIndicator;
  index: number;
  t: ChartTheme;
  asset: AssetConfig;
  onExplain?: (key: string) => void;
}) {
  const lines = orderedLines(ci.result);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {onExplain ? (
        <button
          type="button"
          onClick={() => onExplain(ci.key)}
          className="pointer-events-auto font-semibold text-fg underline decoration-dotted underline-offset-2"
        >
          {ci.title}
        </button>
      ) : (
        <span className="font-semibold text-fg">{ci.title}</span>
      )}
      {lines.length === 0 && (ci.result.priceLevels?.length ?? 0) > 0 && <span className="text-muted">（圖上的點狀橫線）</span>}
      {lines.map((l) => (
        <span key={l.key} className="inline-flex items-center gap-1 whitespace-nowrap">
          <Swatch line={l} color={resolveColor(t, lineColorAt(l, index))} />
          {l.label !== ci.title && <span className="text-muted">{l.label}</span>}
          <span className="text-fg">{formatLineValue(lineValueAt(l, index), l, asset)}</span>
        </span>
      ))}
    </div>
  );
}

function PriceLegend({ bar, prev, asset, compact }: { bar: Candle; prev: Candle | undefined; asset: AssetConfig; compact?: boolean }) {
  const chg = prev ? bar.close / prev.close - 1 : null;
  const item = (label: string, v: number) => (
    <span className="whitespace-nowrap">
      <span className="text-muted">{label}</span> <span className="text-fg">{fmtPrice(v, asset)}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-semibold text-fg">{fmtBarDate(bar.time, bar.endTime)}</span>
      {!compact && item('開', bar.open)}
      {!compact && item('高', bar.high)}
      {!compact && item('低', bar.low)}
      {item('收', bar.close)}
      <span className={signClass(chg)}>{fmtPct(chg)}</span>
    </div>
  );
}

/** 依顯示平移量，把指標數列轉成圖表資料（平移到未來的部分使用預先產生的未來日期） */
function timeAt(j: number, candles: Candle[], future: string[]): string | undefined {
  if (j < 0) return undefined;
  return j < candles.length ? candles[j]!.time : future[j - candles.length];
}

function buildLineData(
  values: Series,
  candles: Candle[],
  future: string[],
  shift: number,
  colors: (ColorRole | null)[] | undefined,
  t: ChartTheme,
): (LineData<Time> | WhitespaceData<Time>)[] {
  const out: (LineData<Time> | WhitespaceData<Time>)[] = [];
  for (let i = 0; i < values.length; i++) {
    const time = timeAt(i + shift, candles, future);
    if (!time) continue;
    const v = values[i];
    if (v === null || v === undefined) {
      if (shift === 0) out.push({ time });
      continue;
    }
    const c = colors?.[i];
    out.push(c ? { time, value: v, color: resolveColor(t, c) } : { time, value: v });
  }
  return out;
}

function buildHistogramData(
  values: Series,
  candles: Candle[],
  colors: (ColorRole | null)[] | undefined,
  t: ChartTheme,
  fallback: string,
): (HistogramData<Time> | WhitespaceData<Time>)[] {
  return values.map((v, i) => {
    const time = candles[i]!.time;
    if (v === null || v === undefined) return { time };
    const c = colors?.[i];
    return { time, value: v, color: withAlpha(c ? resolveColor(t, c) : fallback, 0.7) };
  });
}

function PriceChartImpl({ candles, asset, indicators, markers, visibleBars, rangeKey, compact, onExplain }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<{ key: string; range: LogicalRange } | null>(null);
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const isMobile = useIsMobile();
  /** 十字線所在的 K 棒（沒有觸碰時是 null → 顯示最新一根） */
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  /** 每個區塊（主圖、副圖）在容器裡的位置，用來放圖例 */
  const [boxes, setBoxes] = useState<PaneBox[]>([]);

  const paneCount = indicators.filter((i) => i.placement === 'pane').length;
  const mainHeight = compact ? 240 : isMobile ? 300 : 420;
  const paneHeight = compact ? 110 : isMobile ? 150 : 150;
  const height = mainHeight + paneCount * paneHeight;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;
    const t = getChartTheme(theme, colorMode);
    const n = candles.length;
    const maxShift = Math.max(
      0,
      ...indicators.flatMap((ci) => ci.result.lines.filter((l) => !l.hidden).map((l) => l.shift ?? 0)),
    );
    const future = maxShift > 0 ? futureDates(candles[n - 1]!.time, maxShift, asset.tradesOnWeekends) : [];
    const rightOffset = maxShift > 0 ? maxShift + 2 : 4;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: t.background },
        textColor: t.textMuted,
        fontSize: compact || isMobile ? 11 : 12,
        fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
        attributionLogo: true,
        panes: { separatorColor: t.border, separatorHoverColor: withAlpha(t.accent, 0.25), enableResize: true },
      },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale: { borderColor: t.border, rightOffset, minBarSpacing: 0.3 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'zh-TW', dateFormat: 'yyyy/MM/dd' },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const cFormat = candlePriceFormat(asset);
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: t.up,
      downColor: t.down,
      borderUpColor: t.up,
      borderDownColor: t.down,
      wickUpColor: t.up,
      wickDownColor: t.down,
      priceFormat: cFormat,
    });
    candleSeries.setData([
      ...candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
      ...future.map((time) => ({ time })),
    ]);

    let paneIndex = 0;
    for (const ci of indicators) {
      const pane = ci.placement === 'overlay' ? 0 : ++paneIndex;
      const seriesByKey = new Map<string, ISeriesApi<SeriesType>>();
      for (const line of ci.result.lines) {
        if (line.hidden) continue;
        const color = resolveColor(t, line.color);
        const common = {
          priceLineVisible: false,
          lastValueVisible: ci.placement === 'pane',
          priceFormat: ci.placement === 'overlay' ? cFormat : panePriceFormat(line, asset, !!ci.result.scale),
          ...(ci.result.scale && ci.placement === 'pane'
            ? {
                autoscaleInfoProvider: () => ({
                  priceRange: { minValue: ci.result.scale!.min, maxValue: ci.result.scale!.max },
                }),
              }
            : {}),
        };
        let s: ISeriesApi<SeriesType>;
        if (line.kind === 'histogram') {
          const hs = chart.addSeries(HistogramSeries, { ...common, color }, pane);
          hs.setData(buildHistogramData(line.values, candles, line.colors, t, color));
          s = hs;
        } else {
          const ls = chart.addSeries(
            LineSeries,
            {
              ...common,
              color,
              lineWidth: line.width ?? 1,
              lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
              lineType: line.kind === 'step' ? LineType.WithSteps : LineType.Simple,
              lineVisible: line.kind !== 'dots',
              pointMarkersVisible: line.kind === 'dots',
              pointMarkersRadius: line.kind === 'dots' ? (compact || isMobile ? 1.5 : 2) : undefined,
              crosshairMarkerVisible: line.kind !== 'dots',
            },
            pane,
          );
          ls.setData(buildLineData(line.values, candles, future, line.shift ?? 0, line.colors, t));
          s = ls;
        }
        seriesByKey.set(line.key, s);
      }

      const first = seriesByKey.values().next().value as ISeriesApi<SeriesType> | undefined;
      if (first && ci.placement === 'pane') {
        for (const lv of ci.result.levels ?? []) {
          first.createPriceLine({
            price: lv.value,
            color: withAlpha(lv.color ? resolveColor(t, lv.color) : t.textMuted, 0.8),
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: lv.label,
          });
        }
      }
      for (const pl of ci.result.priceLevels ?? []) {
        candleSeries.createPriceLine({
          price: pl.value,
          color: resolveColor(t, pl.color),
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: pl.label,
        });
      }
      for (const f of ci.result.fills ?? []) {
        const up = ci.result.lines.find((l) => l.key === f.upper);
        const lo = ci.result.lines.find((l) => l.key === f.lower);
        const host = seriesByKey.get(f.upper);
        if (!up || !lo || !host) continue;
        const shift = up.shift ?? 0;
        const points: BandPoint[] = [];
        for (let i = 0; i < up.values.length; i++) {
          const a = up.values[i];
          const b = lo.values[i];
          const time = timeAt(i + shift, candles, future);
          if (a == null || b == null || !time) continue;
          points.push({ time, upper: a, lower: b });
        }
        const op = f.opacity ?? 0.1;
        host.attachPrimitive(
          new BandFill(points, withAlpha(resolveColor(t, f.color), op), withAlpha(resolveColor(t, f.colorWhenInverted ?? f.color), op)),
        );
      }
    }

    const panes = chart.panes();
    panes[0]?.setStretchFactor(mainHeight / paneHeight);
    for (let i = 1; i < panes.length; i++) {
      panes[i]!.setStretchFactor(1);
      panes[i]!.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.04 } });
    }

    if (markers && markers.length) {
      const list: SeriesMarker<Time>[] = markers
        .filter((m) => m.index >= 0 && m.index < n)
        .sort((a, b) => a.index - b.index)
        .map((m) => ({
          time: candles[m.index]!.time,
          position: m.side === 'buy' ? 'belowBar' : 'aboveBar',
          shape: m.side === 'buy' ? 'arrowUp' : 'arrowDown',
          color: m.side === 'buy' ? t.up : t.down,
          // 手機畫面窄，只畫箭頭、不畫文字，避免標記擠在一起
          text: compact || isMobile ? '' : (m.text ?? (m.side === 'buy' ? '買' : '賣')),
          size: compact || isMobile ? 0.7 : 1,
        }));
      createSeriesMarkers(candleSeries, list);
    }

    const ts = chart.timeScale();
    const saved = savedRange.current && savedRange.current.key === rangeKey ? savedRange.current.range : null;
    const applyInitialRange = () =>
      ts.setVisibleLogicalRange(saved ?? { from: Math.max(0, n - visibleBars), to: n - 1 + rightOffset });
    applyInitialRange();
    // 圖表剛建立時容器可能還沒量好尺寸（例如切換頁面的瞬間），可視範圍會套用失敗；
    // 等兩個畫面更新（尺寸確定）之後再套用一次，之後才開始記錄使用者的縮放位置。
    // 量出每個區塊的位置，讓圖例放在各區塊的左上角；區塊大小改變（包括拖動分隔線）時重新量
    const measure = () => {
      const host = el.getBoundingClientRect();
      const next = chart.panes().map((p) => {
        const r = p.getHTMLElement()?.getBoundingClientRect();
        return r ? { top: r.top - host.top, height: r.height } : { top: 0, height: 0 };
      });
      setBoxes((prev) => (sameBoxes(prev, next) ? prev : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const p of chart.panes()) {
      const pe = p.getHTMLElement();
      if (pe) ro.observe(pe);
    }

    let ready = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        applyInitialRange();
        measure();
        ready = true;
      });
    });
    const onRange = (r: LogicalRange | null) => {
      if (ready && r) savedRange.current = { key: rangeKey, range: r };
    };
    ts.subscribeVisibleLogicalRangeChange(onRange);

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.point || param.logical === undefined) {
        setHoverIdx(null);
        return;
      }
      const idx = Math.round(param.logical);
      setHoverIdx(idx < 0 ? null : Math.min(idx, n - 1));
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ts.unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
    };
  }, [candles, asset, indicators, markers, visibleBars, rangeKey, compact, theme, colorMode, isMobile, mainHeight, paneHeight]);

  const t = getChartTheme(theme, colorMode);
  const idx = hoverIdx !== null && hoverIdx < candles.length ? hoverIdx : candles.length - 1;
  const bar = candles[idx];
  const overlays = indicators.filter((ci) => ci.placement === 'overlay');
  const panes = indicators.filter((ci) => ci.placement === 'pane');
  const legendClass =
    'pointer-events-none absolute left-1.5 z-10 max-w-[calc(100%-4.25rem)] space-y-0.5 rounded bg-surface/70 px-1.5 py-0.5 text-[11px] leading-snug tabular md:text-xs';

  return (
    <div className="relative">
      <div ref={containerRef} style={{ height }} className="w-full overflow-hidden rounded-lg border border-line" />
      {/* 圖例：每個區塊左上角標出線的名稱、顏色與數值（類似 TradingView） */}
      {bar && boxes[0] && (
        <div className={legendClass} style={{ top: boxes[0].top + 4 }}>
          <PriceLegend bar={bar} prev={candles[idx - 1]} asset={asset} compact={compact} />
          {overlays.map((ci) => (
            <IndicatorLegend key={ci.key} ci={ci} index={idx} t={t} asset={asset} onExplain={onExplain} />
          ))}
        </div>
      )}
      {panes.map((ci, k) => {
        const box = boxes[k + 1];
        if (!box) return null;
        return (
          <div key={ci.key} className={legendClass} style={{ top: box.top + 3 }}>
            <IndicatorLegend ci={ci} index={idx} t={t} asset={asset} onExplain={onExplain} />
          </div>
        );
      })}
    </div>
  );
}

export const PriceChart = memo(PriceChartImpl);
