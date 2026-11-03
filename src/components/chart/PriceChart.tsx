import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { fmtBarDate, fmtCompact, fmtNum, fmtPct, fmtPrice, signClass } from '../../data/format';
import { indexOfTime, rangeStats, type RangeStats } from '../../data/range';
import { futureDates } from '../../data/resample';
import type { ColorRole, IndicatorResult, LineOutput, Series } from '../../indicators/types';
import { useResolvedTheme, useSettings } from '../../store/settings';
import { getChartTheme, withAlpha, type ChartTheme } from '../../theme';
import { CloseIcon, RulerIcon } from '../icons';
import { BandFill, type BandPoint } from './bandFill';
import { formatLegendValue, legendLabel, lineColorAt, lineValueAt, orderedLines } from './legend';
import { RangeShade, type ShadeRange } from './rangeShade';

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

/** 消息面事件的標記：K 線上方一個小圓點加一個字（例如「升」） */
export interface EventMarker {
  index: number;
  text: string;
  color: ColorRole;
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
  /** 顯示「區間漲跌」工具：點兩根 K 棒，看那段期間漲跌多少 */
  measurable?: boolean;
  /** K 棒的單位，例如「日 K」「週 K」（區間漲跌顯示「共幾根」用） */
  barUnit?: string;
  /** 最後一根 K 棒是否已經收盤（還沒收盤時，區間的終點價格標成「目前」） */
  lastBarComplete?: boolean;
  /** 消息面事件的標記 */
  eventMarkers?: EventMarker[];
  /** 十字線停在某根 K 棒時，在圖例下方顯示那天的事件（K 棒位置 → 事件名稱） */
  eventNotes?: Map<number, string[]>;
}

/** 區間漲跌的選取狀態；用日期記錄，比特幣每分鐘更新資料時也不會跑掉 */
interface MeasureState {
  on: boolean;
  start: string | null;
  end: string | null;
}

const MEASURE_OFF: MeasureState = { on: false, start: null, end: null };

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
  single,
}: {
  ci: ChartIndicator;
  index: number;
  t: ChartTheme;
  asset: AssetConfig;
  onExplain?: (key: string) => void;
  /** 只顯示一行（放在副圖裡面時用，避免擋住線） */
  single?: boolean;
}) {
  const lines = orderedLines(ci.result);
  return (
    <div className={`flex items-center gap-x-2 gap-y-0.5 ${single ? 'flex-nowrap overflow-hidden whitespace-nowrap' : 'flex-wrap'}`}>
      {onExplain ? (
        <button
          type="button"
          onClick={() => onExplain(ci.key)}
          className="pointer-events-auto shrink-0 font-semibold text-fg underline decoration-dotted underline-offset-2"
        >
          {ci.title}
        </button>
      ) : (
        <span className="shrink-0 font-semibold text-fg">{ci.title}</span>
      )}
      {lines.length === 0 && (ci.result.priceLevels?.length ?? 0) > 0 && <span className="text-muted">（圖上的點狀橫線）</span>}
      {lines.length > 0 && lines.every((l) => (l.shift ?? 0) > 0 && lineValueAt(l, index) === null) ? (
        <span className="text-muted">（把十字線移到右邊的未來日期，就會顯示數值）</span>
      ) : null}
      {lines.map((l, i) => {
        if ((l.shift ?? 0) > 0 && lines.every((x) => (x.shift ?? 0) > 0 && lineValueAt(x, index) === null)) return null;
        const label = legendLabel(l);
        // 第一條線和標題同名（例如「成交量」）就不重複寫；其他線一律寫出名稱（例如 MACD 的訊號線）
        const showLabel = !(i === 0 && label === ci.title);
        return (
          <span key={l.key} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
            <Swatch line={l} color={resolveColor(t, lineColorAt(l, index))} />
            {showLabel && <span className="text-muted">{label}</span>}
            <span className="text-fg">{formatLegendValue(lineValueAt(l, index), l, asset)}</span>
          </span>
        );
      })}
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

/** 月/日（例如 10/06），區間漲跌的最高、最低用 */
const shortDate = (time: string) => time.slice(5).replace('-', '/');

/** 起點、終點往前／往後移一根的小按鈕（手機上 K 棒很窄，點不準時用來微調） */
function NudgeButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-sm leading-none font-semibold text-accent hover:bg-accent/15"
    >
      {children}
    </button>
  );
}

/**
 * 「區間漲跌」的說明與結果，放在圖表上方（不蓋住 K 線）。
 * 一打開就是固定的版面（還沒選的地方先顯示「—」），選的過程中圖表不會一直上下跳。
 */
function MeasurePanel({
  candles,
  startIdx,
  stats,
  previewing,
  asset,
  barUnit,
  lastBarComplete,
  onClose,
  onNudge,
}: {
  candles: Candle[];
  startIdx: number;
  stats: RangeStats | null;
  previewing: boolean;
  asset: AssetConfig;
  barUnit?: string;
  lastBarComplete?: boolean;
  onClose: () => void;
  onNudge: (which: 'from' | 'to', delta: -1 | 1) => void;
}) {
  const first = stats ? candles[stats.from] : startIdx >= 0 ? candles[startIdx] : undefined;
  const last = stats ? candles[stats.to] : undefined;
  const done = !!stats && !previewing;
  const live = !!stats && stats.to === candles.length - 1 && lastBarComplete === false;
  const endLabel = live ? '目前' : '收盤';
  const sign = stats ? (stats.change > 0 ? '+' : stats.change < 0 ? '-' : '') : '';
  // 漲跌金額和價格用一樣的小數位數（比特幣價格不顯示小數，漲跌也不顯示）
  const digits = asset.market === 'crypto' && first && Math.abs(first.open) >= 1000 ? 0 : asset.pricePrecision;
  const tone = !stats ? 'bg-surface-2 text-muted' : `${stats.change > 0 ? 'bg-up/10' : stats.change < 0 ? 'bg-down/10' : 'bg-surface-2'} ${signClass(stats.change)}`;
  const box = 'rounded-md border border-line bg-surface px-1 py-1';
  const date = (c: Candle | undefined, placeholder: string) => (c ? fmtBarDate(c.time, c.endTime) : placeholder);

  const note = !first
    ? '點一下圖表上「起點」的那根 K 棒。'
    : !stats
      ? '再點一下「終點」的那根 K 棒。'
      : previewing
        ? '預覽中：點一下確定終點。'
        : `＝ ${shortDate(first.time)} 開盤買進、抱到 ${shortDate(last!.endTime ?? last!.time)} ${live ? '現在（還沒收盤）' : '收盤'}的漲跌。`;

  return (
    <div className="mb-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs tabular" role="status" aria-live="polite">
      <div className="flex items-center gap-1.5">
        <RulerIcon width={15} height={15} className="shrink-0 text-accent" />
        <span className="shrink-0 font-semibold text-fg">區間漲跌</span>
        {done && <span className="min-w-0 truncate text-[11px] text-muted">‹ › 可微調，再點圖表可重選</span>}
        <button type="button" onClick={onClose} aria-label="關閉區間漲跌" className="-my-1 ml-auto shrink-0 p-1 text-muted hover:text-fg">
          <CloseIcon width={16} height={16} />
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center leading-snug">
        <div className={box}>
          <div>
            <span className="text-muted">開盤</span>{' '}
            <span className="font-medium text-fg">{first ? fmtPrice(first.open, asset) : '—'}</span>
          </div>
          <div className="flex min-h-[22px] items-center justify-center text-[11px] text-muted">
            {first && !previewing && <NudgeButton label="起點往前一根" onClick={() => onNudge('from', -1)}>‹</NudgeButton>}
            <span>{date(first, '選起點')}</span>
            {first && !previewing && <NudgeButton label="起點往後一根" onClick={() => onNudge('from', 1)}>›</NudgeButton>}
          </div>
        </div>
        <div className={`rounded-md px-1 py-1 ${tone}`}>
          <div className="font-semibold">{stats ? `${sign}${fmtNum(Math.abs(stats.change), digits)}` : '—'}</div>
          <div className="text-[11px] font-semibold">{stats ? fmtPct(stats.changePct) : '漲跌'}</div>
        </div>
        <div className={box}>
          <div>
            <span className="text-muted">{endLabel}</span>{' '}
            <span className="font-medium text-fg">{stats ? fmtPrice(stats.endPrice, asset) : '—'}</span>
          </div>
          <div className="flex min-h-[22px] items-center justify-center text-[11px] text-muted">
            {done && <NudgeButton label="終點往前一根" onClick={() => onNudge('to', -1)}>‹</NudgeButton>}
            <span>{date(last, '選終點')}</span>
            {done && <NudgeButton label="終點往後一根" onClick={() => onNudge('to', 1)}>›</NudgeButton>}
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-muted">
        {stats ? (
          <>
            {stats.days === 0 ? '同一天' : `相隔 ${stats.days} 天`}・共 {stats.bars} 根{barUnit ?? ' K 棒'}・最高 {fmtPrice(stats.high, asset)}（
            {shortDate(candles[stats.highIdx]!.time)}）・最低 {fmtPrice(stats.low, asset)}（{shortDate(candles[stats.lowIdx]!.time)}）
          </>
        ) : (
          '選好起點和終點後，這裡會顯示相隔幾天，以及這段期間的最高價和最低價。'
        )}
      </p>
      <p className="mt-0.5 text-muted">{note}</p>
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

function PriceChartImpl({
  candles,
  asset,
  indicators,
  markers,
  visibleBars,
  rangeKey,
  compact,
  onExplain,
  measurable,
  barUnit,
  lastBarComplete,
  eventMarkers,
  eventNotes,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<{ key: string; range: LogicalRange } | null>(null);
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const isMobile = useIsMobile();
  /** 十字線所在的 K 棒（沒有觸碰時是 null → 顯示最新一根） */
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  /** 每個區塊（主圖、副圖）在容器裡的位置，用來放圖例 */
  const [boxes, setBoxes] = useState<PaneBox[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(MEASURE_OFF);
  /** 給圖表的點擊事件讀（不用因為開關工具就重建圖表） */
  const measureOnRef = useRef(false);
  /** 每個區塊各一個「區間標示」，以及目前要畫的區間（圖表重建時沿用） */
  const shadesRef = useRef<RangeShade[]>([]);
  const shadeRef = useRef<ShadeRange | null>(null);

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
    // 「區間漲跌」的直線和底色：每個區塊各畫一份，直線才會貫穿整張圖
    shadesRef.current = panes.map((p) => {
      const shade = new RangeShade(shadeRef.current);
      p.attachPrimitive(shade);
      return shade;
    });

    const markerList: (SeriesMarker<Time> & { index: number })[] = [
      ...(markers ?? [])
        .filter((m) => m.index >= 0 && m.index < n)
        .map((m) => ({
          index: m.index,
          time: candles[m.index]!.time,
          position: m.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          shape: m.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
          color: m.side === 'buy' ? t.up : t.down,
          // 手機畫面窄，只畫箭頭、不畫文字，避免標記擠在一起
          text: compact || isMobile ? '' : (m.text ?? (m.side === 'buy' ? '買' : '賣')),
          size: compact || isMobile ? 0.7 : 1,
        })),
      ...(eventMarkers ?? [])
        .filter((m) => m.index >= 0 && m.index < n)
        .map((m) => ({
          index: m.index,
          time: candles[m.index]!.time,
          position: 'aboveBar' as const,
          shape: 'circle' as const,
          color: resolveColor(t, m.color),
          text: m.text,
          size: compact || isMobile ? 0.6 : 0.8,
        })),
    ].sort((a, b) => a.index - b.index);
    if (markerList.length) createSeriesMarkers(candleSeries, markerList.map(({ index: _i, ...m }) => m));

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
      // 有畫到未來的線（例如預測範圍、一目均衡表的雲）時，十字線可以移到未來的日期看數值
      setHoverIdx(idx < 0 ? null : Math.min(idx, n - 1 + maxShift));
    };
    chart.subscribeCrosshairMove(onMove);

    // 區間漲跌：點第一下選起點、第二下選終點；選好之後再點就重新選起點
    const onClick = (param: MouseEventParams<Time>) => {
      if (!measureOnRef.current || !param.point || param.logical === undefined) return;
      const time = candles[Math.max(0, Math.min(n - 1, Math.round(param.logical)))]!.time;
      setMeasure((m) => {
        if (!m.on) return m;
        return m.start === null || m.end !== null ? { on: true, start: time, end: null } : { on: true, start: m.start, end: time };
      });
    };
    chart.subscribeClick(onClick);
    // 圖表套件把 0.5 秒內在同一個位置的第二下當成「雙擊」，不會觸發一般點擊；在這裡也當成一次點擊
    chart.subscribeDblClick(onClick);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ts.unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onMove);
      chart.unsubscribeClick(onClick);
      chart.unsubscribeDblClick(onClick);
      shadesRef.current = [];
      chart.remove();
    };
  }, [candles, asset, indicators, markers, eventMarkers, visibleBars, rangeKey, compact, theme, colorMode, isMobile, mainHeight, paneHeight]);

  // 換標的、週期或區間時，清掉已選的區間（工具保持開著）
  useEffect(() => {
    setMeasure((m) => (m.start === null && m.end === null ? m : { on: m.on, start: null, end: null }));
  }, [rangeKey]);

  // 工具開著時，按 Esc 可以關掉
  useEffect(() => {
    measureOnRef.current = measure.on;
    if (!measure.on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMeasure(MEASURE_OFF);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measure.on]);

  const t = getChartTheme(theme, colorMode);
  const idx = hoverIdx !== null ? hoverIdx : candles.length - 1;
  /** 十字線在未來的日期（最後一根 K 棒的右邊）時，那是第幾天之後 */
  const aheadBars = Math.max(0, idx - (candles.length - 1));
  const bar = candles[Math.min(idx, candles.length - 1)];
  const futureDate =
    aheadBars > 0 && bar ? futureDates(candles[candles.length - 1]!.time, aheadBars, asset.tradesOnWeekends)[aheadBars - 1] : undefined;
  const overlays = indicators.filter((ci) => ci.placement === 'overlay');
  const panes = indicators.filter((ci) => ci.placement === 'pane');

  // 區間漲跌：起點已選、終點還沒選時，用十字線的位置當終點預覽
  const startIdx = measure.on && measure.start ? indexOfTime(candles, measure.start) : -1;
  const endFixed = measure.on && measure.end ? indexOfTime(candles, measure.end) : -1;
  const previewing = startIdx >= 0 && endFixed < 0 && hoverIdx !== null;
  const endIdx = endFixed >= 0 ? endFixed : previewing ? Math.min(hoverIdx!, candles.length - 1) : -1;
  const stats = startIdx >= 0 && endIdx >= 0 ? rangeStats(candles, startIdx, endIdx) : null;
  const shade: ShadeRange | null =
    startIdx >= 0
      ? {
          from: startIdx,
          to: endIdx >= 0 ? endIdx : null,
          color: !stats ? t.accent : stats.change > 0 ? t.up : stats.change < 0 ? t.down : t.textMuted,
        }
      : null;
  const shadeKey = shade ? `${shade.from}|${shade.to}|${shade.color}` : '';

  /** ‹ › 微調：「from」是比較早的那根、「to」是比較晚的那根；兩根最近可以是同一根 */
  const nudge = (which: 'from' | 'to', delta: -1 | 1) => {
    setMeasure((m) => {
      const a = m.start ? indexOfTime(candles, m.start) : -1;
      if (!m.on || a < 0) return m;
      const last = candles.length - 1;
      const b = m.end ? indexOfTime(candles, m.end) : -1;
      if (b < 0) return { ...m, start: candles[Math.max(0, Math.min(last, a + delta))]!.time };
      let from = Math.min(a, b);
      let to = Math.max(a, b);
      if (which === 'from') from = Math.max(0, Math.min(to, from + delta));
      else to = Math.max(from, Math.min(last, to + delta));
      return { on: true, start: candles[from]!.time, end: candles[to]!.time };
    });
  };
  useEffect(() => {
    shadeRef.current = shade;
    for (const s of shadesRef.current) s.setRange(shade);
    // shade 每次 render 都是新物件；內容（shadeKey）有變才需要重畫
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadeKey]);

  return (
    <div>
      {measurable && measure.on && (
        <MeasurePanel
          candles={candles}
          startIdx={startIdx}
          stats={stats}
          previewing={previewing}
          asset={asset}
          barUnit={barUnit}
          lastBarComplete={lastBarComplete}
          onClose={() => setMeasure(MEASURE_OFF)}
          onNudge={nudge}
        />
      )}
      {/* 主圖的圖例放在圖表「上方」，不蓋住 K 線：日期、開高低收，以及疊在 K 線上的指標 */}
      {bar && (
        <div className="mb-1.5 flex items-start gap-2 px-0.5">
          <div className="min-w-0 flex-1 space-y-0.5 text-[11px] leading-snug tabular md:text-xs">
            {futureDate ? (
              <div>
                <span className="font-semibold text-fg">{fmtBarDate(futureDate)}</span>
                <span className="ml-2 text-muted">未來（{aheadBars} 根 K 棒之後，還沒發生）</span>
              </div>
            ) : (
              <PriceLegend bar={bar} prev={candles[idx - 1]} asset={asset} compact={compact} />
            )}
            {overlays.map((ci) => (
              <IndicatorLegend key={ci.key} ci={ci} index={idx} t={t} asset={asset} onExplain={onExplain} />
            ))}
            {eventNotes?.get(idx)?.map((note) => (
              <div key={note} className="text-hot">
                ● {note}
              </div>
            ))}
          </div>
          {measurable && !measure.on && (
            <button
              type="button"
              onClick={() => setMeasure({ on: true, start: null, end: null })}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg hover:bg-surface-2"
            >
              <RulerIcon width={14} height={14} className="text-accent" />
              區間漲跌
            </button>
          )}
        </div>
      )}
      <div className="relative">
        <div ref={containerRef} style={{ height }} className="w-full overflow-hidden rounded-lg border border-line" />
        {/* 副圖的圖例：只佔一行，放在各副圖的左上角 */}
        {panes.map((ci, k) => {
          const box = boxes[k + 1];
          if (!box) return null;
          return (
            <div
              key={ci.key}
              className="pointer-events-none absolute left-1.5 z-10 max-w-[calc(100%-4.25rem)] rounded bg-surface/70 px-1.5 text-[11px] leading-snug tabular md:text-xs"
              style={{ top: box.top + 2 }}
            >
              <IndicatorLegend ci={ci} index={idx} t={t} asset={asset} onExplain={onExplain} single />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const PriceChart = memo(PriceChartImpl);
