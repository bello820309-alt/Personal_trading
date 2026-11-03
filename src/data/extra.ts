import type { Candle } from './types';

/*
 * 比特幣的額外資料（市場情緒、合約、鏈上），由 GitHub Actions 每天抓取，存成 public/data/BTC_extra.json。
 * 每一種資料都是「一天一個數字」，存成「起始日＋數值陣列」（日期依序遞增，缺的那天是 null）以節省空間。
 */

export interface CompactSeries {
  /** 第一個數值的日期（UTC，YYYY-MM-DD） */
  start: string;
  v: (number | null)[];
}

export interface ExtraSeriesFile extends CompactSeries {
  label: string;
  unit: string;
  source: string;
}

export interface ExtraDataFile {
  schemaVersion: 1;
  asset: string;
  updatedAt: string;
  series: Record<string, ExtraSeriesFile>;
}

/** 目前有的資料種類 */
export type ExtraKey = 'fng' | 'funding' | 'activeAddresses' | 'txCount' | 'hashRate' | 'mvrv';

const DAY = 86400000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function toCompact(t: string[], v: number[], round: (x: number) => number = (x) => x): CompactSeries {
  if (!t.length) return { start: '', v: [] };
  const start = toMs(t[0]!);
  const out: (number | null)[] = new Array(Math.round((toMs(t[t.length - 1]!) - start) / DAY) + 1).fill(null);
  for (let i = 0; i < t.length; i++) out[Math.round((toMs(t[i]!) - start) / DAY)] = round(v[i]!);
  return { start: t[0]!, v: out };
}

export function fromCompact(c: CompactSeries): { t: string[]; v: number[] } {
  const t: string[] = [];
  const v: number[] = [];
  const start = toMs(c.start);
  c.v.forEach((x, i) => {
    if (x === null || !Number.isFinite(x)) return;
    t.push(toDate(start + i * DAY));
    v.push(x);
  });
  return { t, v };
}

/** 某一天的數值；沒有資料時回傳 null */
export function valueOn(c: CompactSeries, date: string): number | null {
  if (!c.start) return null;
  const i = Math.round((toMs(date) - toMs(c.start)) / DAY);
  return i >= 0 && i < c.v.length ? (c.v[i] ?? null) : null;
}

/** 最後一個有資料的日期 */
export function lastDate(c: CompactSeries): string | null {
  for (let i = c.v.length - 1; i >= 0; i--) if (c.v[i] !== null) return toDate(toMs(c.start) + i * DAY);
  return null;
}

/**
 * 對齊到 K 棒：每根 K 棒取「那根 K 棒最後一天」的數值（週 K、月 K 是那週、那個月最後一天）；
 * 那天剛好沒資料時，往前找最多 maxGapDays 天。
 */
export function alignToCandles(c: CompactSeries | undefined, candles: readonly Candle[], maxGapDays = 3): (number | null)[] {
  if (!c || !c.start) return candles.map(() => null);
  const start = toMs(c.start);
  return candles.map((k) => {
    const end = Math.round((toMs(k.endTime ?? k.time) - start) / DAY);
    for (let i = Math.min(end, c.v.length - 1); i >= 0 && end - i <= maxGapDays; i--) {
      const x = c.v[i];
      if (x !== null && x !== undefined) return x;
    }
    return null;
  });
}
