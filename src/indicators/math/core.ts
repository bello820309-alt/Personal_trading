import type { Candle } from '../../data/types';
import type { Num, Series, Signal } from '../types';

/*
 * 指標共用的數學工具。約定：
 * - 輸入數列可以有「開頭的一段 null」（暖身期），之後必須是連續的數字。
 * - 輸出和輸入等長，算不出來的位置填 null。
 * - 所有計算都只用「當下以前」的資料（不偷看未來），回測才可信。
 */

export function nulls(n: number): Series {
  return new Array<Num>(n).fill(null);
}

function toPeriod(period: number): number {
  return Math.max(1, Math.floor(period));
}

/** 第一個非 null 的位置；全部都是 null 時回傳長度 */
export function firstValid(values: Series): number {
  for (let i = 0; i < values.length; i++) if (values[i] !== null) return i;
  return values.length;
}

/** 簡單移動平均：最近 period 個值的平均 */
export function sma(values: Series, period: number): Series {
  const p = toPeriod(period);
  const n = values.length;
  const out = nulls(n);
  const start = firstValid(values);
  let sum = 0;
  for (let i = start; i < n; i++) {
    const v = values[i];
    if (v === null) break;
    sum += v;
    if (i - start >= p) sum -= values[i - p] as number;
    if (i - start >= p - 1) out[i] = sum / p;
  }
  return out;
}

/**
 * 指數平滑的共用版本：起始值是前 period 筆的簡單平均，之後
 * 今日值 = 昨日值 + alpha × (今日資料 − 昨日值)
 */
function seededSmoothing(values: Series, period: number, alpha: number): Series {
  const p = toPeriod(period);
  const n = values.length;
  const out = nulls(n);
  const start = firstValid(values);
  if (start + p > n) return out;
  let sum = 0;
  for (let i = start; i < start + p; i++) sum += values[i] as number;
  let prev = sum / p;
  out[start + p - 1] = prev;
  for (let i = start + p; i < n; i++) {
    const v = values[i];
    if (v === null) break;
    prev = prev + alpha * (v - prev);
    out[i] = prev;
  }
  return out;
}

/** 指數移動平均 EMA：alpha = 2 / (n + 1)，起始值用 SMA（與 TA-Lib 相同） */
export function ema(values: Series, period: number): Series {
  const p = toPeriod(period);
  return seededSmoothing(values, p, 2 / (p + 1));
}

/** Wilder 平滑（RMA）：alpha = 1 / n，RSI、ATR、DMI 都用這個 */
export function rma(values: Series, period: number): Series {
  const p = toPeriod(period);
  return seededSmoothing(values, p, 1 / p);
}

/**
 * 固定起始值的指數平滑（台灣 KD 用：起始值 50，alpha = 1/3）
 * 今日值 = 昨日值 × (1 − alpha) + 今日資料 × alpha
 */
export function smoothFrom(values: Series, alpha: number, seed: number): Series {
  const n = values.length;
  const out = nulls(n);
  let prev = seed;
  for (let i = firstValid(values); i < n; i++) {
    const v = values[i];
    if (v === null) break;
    prev = prev * (1 - alpha) + v * alpha;
    out[i] = prev;
  }
  return out;
}

export function rollingSum(values: Series, period: number): Series {
  const p = toPeriod(period);
  const avg = sma(values, p);
  return avg.map((v) => (v === null ? null : v * p));
}

/** 母體標準差（布林通道用的就是母體標準差） */
export function stdev(values: Series, period: number): Series {
  const p = toPeriod(period);
  const n = values.length;
  const out = nulls(n);
  const mean = sma(values, p);
  for (let i = 0; i < n; i++) {
    const m = mean[i];
    if (m === null || m === undefined) continue;
    let acc = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const d = (values[j] as number) - m;
      acc += d * d;
    }
    out[i] = Math.sqrt(acc / p);
  }
  return out;
}

/** 最近 period 個值的最大值 */
export function highest(values: Series, period: number): Series {
  return rollingExtreme(values, period, (a, b) => a > b);
}

/** 最近 period 個值的最小值 */
export function lowest(values: Series, period: number): Series {
  return rollingExtreme(values, period, (a, b) => a < b);
}

function rollingExtreme(values: Series, period: number, better: (a: number, b: number) => boolean): Series {
  const p = toPeriod(period);
  const n = values.length;
  const out = nulls(n);
  const start = firstValid(values);
  for (let i = start + p - 1; i < n; i++) {
    let best = values[i - p + 1] as number;
    for (let j = i - p + 2; j <= i; j++) {
      const v = values[j] as number;
      if (better(v, best)) best = v;
    }
    out[i] = best;
  }
  return out;
}

/** 真實區間 TR：max(高−低, |高−昨收|, |低−昨收|)。第一根沒有昨收，填 null。 */
export function trueRange(candles: Candle[]): Series {
  const out = nulls(candles.length);
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prevClose = candles[i - 1]!.close;
    out[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }
  return out;
}

/** Wilder 的 ATR：TR 的 RMA（第一個值 = 前 period 個 TR 的平均） */
export function atrWilder(candles: Candle[], period: number): Series {
  return rma(trueRange(candles), period);
}

export function closes(candles: Candle[]): Series {
  return candles.map((c) => c.close);
}

export function highs(candles: Candle[]): Series {
  return candles.map((c) => c.high);
}

export function lows(candles: Candle[]): Series {
  return candles.map((c) => c.low);
}

/** 兩個數列（或數列與常數）逐點運算，任一邊為 null 結果就是 null */
export function zip(a: Series, b: Series | number, fn: (x: number, y: number) => number): Series {
  return a.map((x, i) => {
    const y = typeof b === 'number' ? b : b[i];
    return x === null || y === null || y === undefined ? null : fn(x, y);
  });
}

function at(s: Series | number, i: number): Num {
  if (typeof s === 'number') return s;
  const v = s[i];
  return v === undefined ? null : v;
}

/** a 在第 i 根由下往上穿越 b（昨天 a ≤ b、今天 a > b） */
export function crossOver(a: Series | number, b: Series | number, i: number): boolean {
  if (i < 1) return false;
  const a0 = at(a, i - 1);
  const a1 = at(a, i);
  const b0 = at(b, i - 1);
  const b1 = at(b, i);
  if (a0 === null || a1 === null || b0 === null || b1 === null) return false;
  return a0 <= b0 && a1 > b1;
}

/** a 在第 i 根由上往下跌破 b（昨天 a ≥ b、今天 a < b） */
export function crossUnder(a: Series | number, b: Series | number, i: number): boolean {
  if (i < 1) return false;
  const a0 = at(a, i - 1);
  const a1 = at(a, i);
  const b0 = at(b, i - 1);
  const b1 = at(b, i);
  if (a0 === null || a1 === null || b0 === null || b1 === null) return false;
  return a0 >= b0 && a1 < b1;
}

/** 逐根檢查買、賣條件，產生訊號清單（同一根同時成立時以買進為準） */
export function scanSignals(
  n: number,
  isBuy: (i: number) => boolean,
  isSell: (i: number) => boolean,
  buyLabel: string,
  sellLabel: string,
): Signal[] {
  const out: Signal[] = [];
  for (let i = 1; i < n; i++) {
    if (isBuy(i)) out.push({ index: i, side: 'buy', label: buyLabel });
    else if (isSell(i)) out.push({ index: i, side: 'sell', label: sellLabel });
  }
  return out;
}

/** 數列最後一個有效值與其位置 */
export function lastValid(values: Series): { value: number; index: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined) return { value: v, index: i };
  }
  return null;
}

/** value 在 window 裡的百分位（0～100）：有多少比例的歷史值比它小 */
export function percentileRank(window: number[], value: number): number {
  if (window.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const v of window) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return ((below + equal / 2) / window.length) * 100;
}

/** 由小到大排序後取第 p 百分位（線性內插） */
export function quantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const pos = (sortedAsc.length - 1) * Math.min(1, Math.max(0, p / 100));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sortedAsc[lo]!;
  const b = sortedAsc[hi]!;
  return a + (b - a) * (pos - lo);
}

/** 取得數列 [from, to) 內的有效數字 */
export function validSlice(values: Series, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, from); i < Math.min(values.length, to); i++) {
    const v = values[i];
    if (v !== null && v !== undefined) out.push(v);
  }
  return out;
}

/** 最後一次訊號距今幾根 K 棒 */
export function lastSignalOf(signals: Signal[], side?: 'buy' | 'sell'): Signal | undefined {
  for (let i = signals.length - 1; i >= 0; i--) {
    const s = signals[i]!;
    if (!side || s.side === side) return s;
  }
  return undefined;
}
