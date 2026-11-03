import { daysBetween } from './format';
import type { Candle } from './types';

/** 圖表上選取一段區間後要顯示的統計 */
export interface RangeStats {
  /** 區間的第一根、最後一根 K 棒（含頭尾，from ≤ to） */
  from: number;
  to: number;
  /** 起點 K 棒的開盤價 */
  startPrice: number;
  /** 終點 K 棒的收盤價 */
  endPrice: number;
  change: number;
  /** 比例：0.0086 代表 +0.86% */
  changePct: number;
  /** 共幾根 K 棒 */
  bars: number;
  /** 起點那根的第一天到終點那根的最後一天，相隔幾天 */
  days: number;
  high: number;
  highIdx: number;
  low: number;
  lowIdx: number;
}

/**
 * 第 a 根到第 b 根 K 棒（含頭尾，先選哪一根都可以）的漲跌。
 * 和常見看盤軟體的「區間」一樣：從起點那根的開盤價算到終點那根的收盤價，
 * 也就是「起點開盤買進、抱到終點收盤」的漲跌。
 */
export function rangeStats(candles: readonly Candle[], a: number, b: number): RangeStats | null {
  const n = candles.length;
  if (n === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const from = Math.max(0, Math.min(n - 1, Math.round(Math.min(a, b))));
  const to = Math.max(0, Math.min(n - 1, Math.round(Math.max(a, b))));
  const first = candles[from]!;
  const last = candles[to]!;
  let high = -Infinity;
  let highIdx = from;
  let low = Infinity;
  let lowIdx = from;
  for (let i = from; i <= to; i++) {
    const c = candles[i]!;
    if (c.high > high) {
      high = c.high;
      highIdx = i;
    }
    if (c.low < low) {
      low = c.low;
      lowIdx = i;
    }
  }
  const startPrice = first.open;
  const endPrice = last.close;
  return {
    from,
    to,
    startPrice,
    endPrice,
    change: endPrice - startPrice,
    changePct: startPrice > 0 ? endPrice / startPrice - 1 : NaN,
    bars: to - from + 1,
    days: daysBetween(first.time, last.endTime ?? last.time),
    high,
    highIdx,
    low,
    lowIdx,
  };
}

/** 日期區間（含頭尾）對應到的第一根、最後一根 K 棒；區間內沒有 K 棒時回傳 null */
export function indexRange(candles: readonly Candle[], from: string, to: string): { start: number; end: number } | null {
  if (!candles.length || from > to) return null;
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.time < from) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  lo = 0;
  hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.time <= to) lo = mid + 1;
    else hi = mid;
  }
  const end = lo - 1;
  return start <= end ? { start, end } : null;
}

/** 檢查 YYYY-MM-DD 格式（網址參數用） */
export function isIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** 依日期找 K 棒的位置（K 棒依日期由舊到新排序）；找不到回傳 -1 */
export function indexOfTime(candles: readonly Candle[], time: string): number {
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = candles[mid]!.time;
    if (t === time) return mid;
    if (t < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
