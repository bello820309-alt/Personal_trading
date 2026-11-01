import type { Candle } from './types';

export type Timeframe = 'D' | 'W' | 'M';

export const TIMEFRAME_LABELS: Record<Timeframe, string> = { D: '日 K', W: '週 K', M: '月 K' };

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** 該日期所在週的星期一（ISO 週，週一開始） */
export function weekKey(date: string): string {
  const d = utcDate(date);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function yearKey(date: string): string {
  return date.slice(0, 4);
}

/**
 * 日 K 轉週 K／月 K：開盤取第一天、收盤取最後一天、最高最低取極值、成交量加總。
 * K 棒的日期用該週（月）第一個交易日。
 * 也會同步回傳每根新 K 棒的「最後一筆」索引，方便對應其他數列（例如還原收盤價）。
 */
export function resample(candles: Candle[], tf: Timeframe): { candles: Candle[]; lastIndex: number[] } {
  if (tf === 'D') return { candles, lastIndex: candles.map((_, i) => i) };
  const keyFn = tf === 'W' ? weekKey : monthKey;
  const out: Candle[] = [];
  const lastIndex: number[] = [];
  let cur: Candle | null = null;
  let curKey = '';
  candles.forEach((c, i) => {
    const k = keyFn(c.time);
    if (!cur || k !== curKey) {
      if (cur) out.push(cur);
      cur = { ...c };
      curKey = k;
      lastIndex.push(i);
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
      lastIndex[lastIndex.length - 1] = i;
    }
  });
  if (cur) out.push(cur);
  return { candles: out, lastIndex };
}

/**
 * 還原權息：用「還原收盤價 ÷ 收盤價」的比例，等比例調整開高低收。
 * 這樣配息造成的「除息缺口」會被補回來，長期報酬才算得準。
 */
export function adjustCandles(candles: Candle[], adjClose: number[]): Candle[] {
  return candles.map((c, i) => {
    const ac = adjClose[i];
    const f = ac && c.close ? ac / c.close : 1;
    if (f === 1) return c;
    return { ...c, open: c.open * f, high: c.high * f, low: c.low * f, close: ac! };
  });
}

/** 在最後一根之後產生 count 個未來日期（股票跳過週末；加密貨幣每天都有） */
export function futureDates(lastDate: string, count: number, includeWeekends: boolean): string[] {
  const out: string[] = [];
  const d = utcDate(lastDate);
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (!includeWeekends && (day === 0 || day === 6)) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
