import type { AssetConfig } from '../config/assets';
import type { Candle } from '../data/types';
import { quantile, sma } from '../indicators/math/core';
import { rsiSeries } from '../indicators/momentum/rsi';

/*
 * 歷史類比法（Analog Forecasting，也叫「相似走勢比對」，本質是 k 最近鄰 k-NN）：
 * 1. 用幾個數字描述「現在的狀態」：最近 1 週～3 個月的漲跌、和 200 日均線的距離、RSI、波動、離一年高點多遠
 * 2. 在過去的資料裡，找出這些數字和現在最接近的 K 個日子（彼此至少相隔 1 個月，避免同一段行情重複計算）
 * 3. 看那些日子「之後」發生了什麼，整理成上漲機率、中位數與可能範圍
 * 所有特徵都只用「當天以前」的資料；回頭檢驗時，也只用「當時已經知道結果」的相似日子。
 */

/** 百分位（frac 是 0～1，例如 0.9 = 第 90 百分位） */
const q = (sortedAsc: number[], frac: number) => quantile(sortedAsc, frac * 100);

export type HorizonKey = '1w' | '1m' | '3m';

export interface Horizon {
  key: HorizonKey;
  label: string;
  /** 幾根 K 棒（比特幣每天都交易；股票一年約 252 個交易日） */
  bars: number;
}

export interface Calendar {
  week: number;
  month: number;
  year: number;
}

export function calendarFor(asset: Pick<AssetConfig, 'tradesOnWeekends'>): Calendar {
  return asset.tradesOnWeekends ? { week: 7, month: 30, year: 365 } : { week: 5, month: 21, year: 252 };
}

export function horizonsFor(asset: Pick<AssetConfig, 'tradesOnWeekends'>): Horizon[] {
  const c = calendarFor(asset);
  return [
    { key: '1w', label: '1 週後', bars: c.week },
    { key: '1m', label: '1 個月後', bars: c.month },
    { key: '3m', label: '3 個月後', bars: 3 * c.month },
  ];
}

export const FEATURES = [
  { key: 'r1w', label: '近 1 週漲跌', kind: 'pct' },
  { key: 'r2w', label: '近 2 週漲跌', kind: 'pct' },
  { key: 'r1m', label: '近 1 個月漲跌', kind: 'pct' },
  { key: 'r2m', label: '近 2 個月漲跌', kind: 'pct' },
  { key: 'r3m', label: '近 3 個月漲跌', kind: 'pct' },
  { key: 'ma200', label: '和 200 日均線的距離', kind: 'pct' },
  { key: 'rsi', label: 'RSI(14)', kind: 'num' },
  { key: 'vol', label: '最近 1 個月的波動 ÷ 過去一年的波動', kind: 'ratio' },
  { key: 'dd', label: '離一年內最高點', kind: 'pct' },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];

/** 每根 K 棒的特徵（資料不夠算的前段是 null） */
export function buildFeatures(candles: readonly Candle[], cal: Calendar): (number[] | null)[] {
  const n = candles.length;
  const c = candles.map((x) => x.close);
  const ma = sma(c, 200);
  const rsi = rsiSeries(c, 14);
  const lags = [cal.week, 2 * cal.week, cal.month, 2 * cal.month, 3 * cal.month];
  // 每日對數報酬的前綴和，用來快速算一段期間的標準差
  const s1 = new Float64Array(n + 1);
  const s2 = new Float64Array(n + 1);
  for (let i = 1; i < n; i++) {
    const r = Math.log(c[i]! / c[i - 1]!);
    s1[i + 1] = s1[i]! + r;
    s2[i + 1] = s2[i]! + r * r;
  }
  const sd = (from: number, to: number) => {
    // 第 from～to 根（含）的日報酬
    const m = to - from + 1;
    const mean = (s1[to + 1]! - s1[from]!) / m;
    return Math.sqrt(Math.max(0, (s2[to + 1]! - s2[from]!) / m - mean * mean));
  };
  const need = Math.max(3 * cal.month, 200, cal.year);
  const out: (number[] | null)[] = new Array(n).fill(null);
  for (let i = need; i < n; i++) {
    const m = ma[i];
    const r = rsi[i];
    if (m === null || m === undefined || r === null || r === undefined) continue;
    let hi = 0;
    for (let j = i - cal.year + 1; j <= i; j++) hi = Math.max(hi, c[j]!);
    const volY = sd(i - cal.year + 1, i);
    out[i] = [
      ...lags.map((L) => c[i]! / c[i - L]! - 1),
      c[i]! / m - 1,
      r,
      volY > 0 ? sd(i - cal.month + 1, i) / volY : 1,
      c[i]! / hi - 1,
    ];
  }
  return out;
}

/** 把每個特徵換成「標準分數」（減平均、除以標準差），讓不同單位的數字可以一起比較 */
export function standardize(rows: readonly (number[] | null)[]): (number[] | null)[] {
  const valid = rows.filter((r): r is number[] => r !== null);
  if (!valid.length) return rows.map(() => null);
  const f = valid[0]!.length;
  const mean = new Array(f).fill(0);
  const sd = new Array(f).fill(0);
  for (const r of valid) for (let j = 0; j < f; j++) mean[j] += r[j]! / valid.length;
  for (const r of valid) for (let j = 0; j < f; j++) sd[j] += (r[j]! - mean[j]) ** 2 / valid.length;
  for (let j = 0; j < f; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  return rows.map((r) => (r ? r.map((x, j) => (x - mean[j]) / sd[j]) : null));
}

export interface Analog {
  index: number;
  distance: number;
}

/**
 * 找出和第 target 根最像的 k 個日子：只從第 maxIdx 根以前找（之後的結果才是已知的），
 * 而且彼此至少相隔 minGap 根，避免同一段行情被重複計算好幾次。
 */
export function findAnalogs(z: readonly (number[] | null)[], target: number, opts: { k: number; minGap: number; maxIdx: number }): Analog[] {
  const tz = z[target];
  if (!tz) return [];
  const cand: Analog[] = [];
  for (let i = 0; i <= Math.min(opts.maxIdx, z.length - 1); i++) {
    const r = z[i];
    if (!r) continue;
    let d = 0;
    for (let j = 0; j < r.length; j++) d += (r[j]! - tz[j]!) ** 2;
    cand.push({ index: i, distance: Math.sqrt(d) });
  }
  cand.sort((a, b) => a.distance - b.distance);
  const picked: Analog[] = [];
  for (const c of cand) {
    if (picked.every((p) => Math.abs(p.index - c.index) >= opts.minGap)) picked.push(c);
    if (picked.length >= opts.k) break;
  }
  return picked;
}

/** 從第 i 根收盤起算，之後第 0～h 根的漲跌（0 = 當天，所以是 0） */
export function forwardPath(candles: readonly Candle[], i: number, h: number): number[] {
  const base = candles[i]!.close;
  const out: number[] = [];
  for (let k = 0; k <= h && i + k < candles.length; k++) out.push(candles[i + k]!.close / base - 1);
  return out;
}

export interface OutcomeStats {
  n: number;
  /** 上漲的比例 */
  up: number;
  median: number;
  mean: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

export function outcomeStats(values: number[]): OutcomeStats | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    up: s.filter((x) => x > 0).length / s.length,
    median: q(s, 0.5),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p10: q(s, 0.1),
    p25: q(s, 0.25),
    p75: q(s, 0.75),
    p90: q(s, 0.9),
  };
}

export interface ConePoint {
  k: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface Forecast {
  /** 以哪一根 K 棒（最後一根已收盤）為起點 */
  target: number;
  analogs: Analog[];
  /** 每個相似日子之後的走勢（第 0～最長期間根） */
  paths: number[][];
  horizons: { horizon: Horizon; stats: OutcomeStats }[];
  /** 預測區間：每一天的 10／25／50／75／90 百分位 */
  cone: ConePoint[];
  /** 第 target 根的原始特徵（說明「現在」用） */
  features: number[];
  /** 每個相似日子的原始特徵（和現在比較用） */
  analogFeatures: number[][];
}

export const DEFAULT_K = 30;

export function analogForecast(candles: readonly Candle[], asset: Pick<AssetConfig, 'tradesOnWeekends'>, k = DEFAULT_K): Forecast | null {
  const cal = calendarFor(asset);
  const horizons = horizonsFor(asset);
  const hMax = horizons[horizons.length - 1]!.bars;
  const raw = buildFeatures(candles, cal);
  const target = candles.length - 1;
  if (!raw[target]) return null;
  const z = standardize(raw);
  const analogs = findAnalogs(z, target, { k, minGap: cal.month, maxIdx: target - hMax });
  if (analogs.length < 5) return null;
  const paths = analogs.map((a) => forwardPath(candles, a.index, hMax));
  const cone: ConePoint[] = [];
  for (let step = 0; step <= hMax; step++) {
    const s = paths.map((p) => p[step]!).sort((a, b) => a - b);
    cone.push({ k: step, p10: q(s, 0.1), p25: q(s, 0.25), p50: q(s, 0.5), p75: q(s, 0.75), p90: q(s, 0.9) });
  }
  return {
    target,
    analogs,
    paths,
    horizons: horizons.map((h) => ({ horizon: h, stats: outcomeStats(paths.map((p) => p[h.bars]!))! })),
    cone,
    features: raw[target]!,
    analogFeatures: analogs.map((a) => raw[a.index]!),
  };
}

export interface CheckResult {
  horizon: Horizon;
  /** 檢驗了幾次 */
  tests: number;
  /** 依「相似日子的中位數」猜漲跌方向，猜對的比例 */
  hit: number;
  /** 一直猜「漲」會猜對的比例（對照組） */
  alwaysUp: number;
  /** 實際結果落在預測的 10%～90% 範圍內的比例（估得準的話應該接近 80%） */
  coverage: number;
  from: string;
  to: string;
}

/**
 * 回頭檢驗（walk-forward）：假裝站在過去的某一天，只用「當時已經知道結果」的相似日子做預測，
 * 再和實際的結果比對。每隔 1 週檢驗一次，涵蓋最近 years 年。
 */
export function walkForwardCheck(
  candles: readonly Candle[],
  asset: Pick<AssetConfig, 'tradesOnWeekends'>,
  opts: { k?: number; years?: number } = {},
): CheckResult[] {
  const k = opts.k ?? DEFAULT_K;
  const cal = calendarFor(asset);
  const horizons = horizonsFor(asset);
  const hMax = horizons[horizons.length - 1]!.bars;
  const z = standardize(buildFeatures(candles, cal));
  const last = candles.length - 1;
  const start = Math.max(0, last - Math.round((opts.years ?? 5) * cal.year));
  const acc = horizons.map(() => ({ tests: 0, hit: 0, up: 0, inside: 0, from: '', to: '' }));
  for (let t = start; t <= last - horizons[0]!.bars; t += cal.week) {
    if (!z[t]) continue;
    const analogs = findAnalogs(z, t, { k, minGap: cal.month, maxIdx: t - hMax });
    if (analogs.length < Math.min(k, 15)) continue;
    horizons.forEach((h, j) => {
      if (t + h.bars > last) return;
      const s = analogs.map((a) => candles[a.index + h.bars]!.close / candles[a.index]!.close - 1).sort((a, b) => a - b);
      const pred = q(s, 0.5);
      const actual = candles[t + h.bars]!.close / candles[t]!.close - 1;
      const e = acc[j]!;
      e.tests++;
      if (pred > 0 === actual > 0) e.hit++;
      if (actual > 0) e.up++;
      if (actual >= q(s, 0.1) && actual <= q(s, 0.9)) e.inside++;
      if (!e.from) e.from = candles[t]!.time;
      e.to = candles[t]!.time;
    });
  }
  return horizons.map((h, j) => {
    const e = acc[j]!;
    return {
      horizon: h,
      tests: e.tests,
      hit: e.tests ? e.hit / e.tests : 0,
      alwaysUp: e.tests ? e.up / e.tests : 0,
      coverage: e.tests ? e.inside / e.tests : 0,
      from: e.from,
      to: e.to,
    };
  });
}
