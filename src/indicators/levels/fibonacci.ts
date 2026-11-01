import type { Candle } from '../../data/types';
import { fmtDate, fmtNum } from '../../data/format';
import type { ColorRole, IndicatorDef, PriceLevel } from '../types';

export type FibParams = { lookback: number };

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export interface FibLevels {
  levels: { ratio: number; value: number }[];
  high: number;
  low: number;
  highIndex: number;
  lowIndex: number;
  /** up = 先低後高（上漲後的回檔）；down = 先高後低（下跌後的反彈） */
  direction: 'up' | 'down';
}

/** 在最近 lookback 根 K 棒中找最高點與最低點，算出回撤價位 */
export function fibLevels(candles: Candle[], lookback: number): FibLevels | null {
  const n = candles.length;
  if (n < 2) return null;
  const start = Math.max(0, n - Math.max(2, Math.floor(lookback)));
  let hi = start;
  let lo = start;
  for (let i = start; i < n; i++) {
    if (candles[i]!.high > candles[hi]!.high) hi = i;
    if (candles[i]!.low < candles[lo]!.low) lo = i;
  }
  const high = candles[hi]!.high;
  const low = candles[lo]!.low;
  const direction = hi >= lo ? 'up' : 'down';
  const range = high - low;
  const levels = FIB_RATIOS.map((ratio) => ({
    ratio,
    value: direction === 'up' ? high - range * ratio : low + range * ratio,
  }));
  return { levels, high, low, highIndex: hi, lowIndex: lo, direction };
}

function levelColor(r: number): ColorRole {
  if (r === 0 || r === 1) return 'muted';
  if (r === 0.382 || r === 0.5 || r === 0.618) return 'hot';
  return 's3';
}

export function fibLabel(r: number): string {
  return `${fmtNum(r * 100, r === 0 || r === 0.5 || r === 1 ? 0 : 1)}%`;
}

export const fibonacciIndicator: IndicatorDef<FibParams> = {
  id: 'fibonacci',
  shortName: '費波那契',
  name: '費波那契回撤',
  enName: 'Fibonacci Retracement',
  category: 'levels',
  placement: 'overlay',
  params: [
    {
      key: 'lookback',
      type: 'number',
      label: '找高低點的範圍（K 棒數）',
      min: 20,
      max: 1000,
      step: 10,
      help: '在最近這麼多根 K 棒裡找最高點和最低點。',
    },
  ],
  defaults: { lookback: 120 },
  compute(candles, p) {
    const fib = fibLevels(candles, p.lookback);
    const priceLevels: PriceLevel[] = fib
      ? fib.levels.map((l) => ({ value: l.value, label: `Fib ${fibLabel(l.ratio)}`, color: levelColor(l.ratio) }))
      : [];
    return { lines: [], priceLevels };
  },
  describe(candles, _r, p) {
    const fib = fibLevels(candles, p.lookback);
    if (!fib) return null;
    const close = candles[candles.length - 1]!.close;
    const sorted = [...fib.levels].sort((a, b) => a.value - b.value);
    let below = sorted[0]!;
    let above = sorted[sorted.length - 1]!;
    for (const l of sorted) {
      if (l.value <= close) below = l;
    }
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i]!.value >= close) above = sorted[i]!;
    }
    const swing =
      fib.direction === 'up'
        ? `最近 ${p.lookback} 根 K 棒從 ${fmtDate(candles[fib.lowIndex]!.time)} 的低點 ${fmtNum(fib.low)} 漲到 ${fmtDate(
            candles[fib.highIndex]!.time,
          )} 的高點 ${fmtNum(fib.high)}，以下是「漲多回檔」可能的支撐。`
        : `最近 ${p.lookback} 根 K 棒從 ${fmtDate(candles[fib.highIndex]!.time)} 的高點 ${fmtNum(fib.high)} 跌到 ${fmtDate(
            candles[fib.lowIndex]!.time,
          )} 的低點 ${fmtNum(fib.low)}，以下是「跌深反彈」可能的壓力。`;
    const where =
      below === above
        ? `收盤價剛好在 ${fibLabel(below.ratio)}（${fmtNum(below.value)}）附近`
        : `收盤價 ${fmtNum(close)} 介於 ${fibLabel(below.ratio)}（${fmtNum(below.value)}）和 ${fibLabel(
            above.ratio,
          )}（${fmtNum(above.value)}）之間`;
    return { tone: 'neutral', headline: where, detail: swing };
  },
  noSignalReason:
    '費波那契回撤只是畫出「可能的支撐、壓力價位」，而且高低點的選法因人而異，本身不會產生買賣訊號。常見用法是等價格回到 38.2%～61.8% 附近、再搭配其他指標確認。',
};
