import { describe, expect, it } from 'vitest';
import type { Candle } from '../../data/types';
import { recentSpike, volumeIndicator } from './volume';

/* 爆量之後，均量會被拉高：說明裡直接寫出「放量之前的均量」比較的倍數 */

const day = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);
const candles = (vols: number[], closes?: number[]): Candle[] =>
  vols.map((volume, i) => {
    const close = closes?.[i] ?? 100;
    return { time: day(i), open: close, high: close + 1, low: close - 1, close, volume };
  });

describe('最近的爆量', () => {
  it('找出放量從哪一天開始，以及放量之前的均量', () => {
    // 25 天平常的量 100，接著 2 天 150（1.3 倍以上）、1 天 600（爆量）
    const vols = [...Array(25).fill(100), 150, 150, 600];
    const c = candles(vols);
    const p = { ma1: 5, ma2: 20 };
    const r = volumeIndicator.compute(c, p);
    const avg = r.lines.find((l) => l.key === 'ma2')!.values;
    expect(recentSpike(vols, avg, vols.length)).toEqual({ start: 25, base: 100 });
    const d = volumeIndicator.describe!(c, r, p)!;
    expect(d.detail).toContain('這一波放量從 10/26 開始');
    expect(d.detail).toContain('放量之前（10/25 為止）20 日均量的 6.0 倍');
  });

  it('最近 10 天沒有爆量就不提', () => {
    const vols = [...Array(25).fill(100), 180, 120];
    const c = candles(vols);
    const p = { ma1: 5, ma2: 20 };
    const r = volumeIndicator.compute(c, p);
    expect(volumeIndicator.describe!(c, r, p)!.detail).not.toContain('放量之前');
  });

  it('爆量過後量縮回來時，也寫出和放量之前比的倍數', () => {
    const vols = [...Array(25).fill(100), 500, 300, 110];
    const c = candles(vols);
    const p = { ma1: 5, ma2: 20 };
    const r = volumeIndicator.compute(c, p);
    expect(volumeIndicator.describe!(c, r, p)!.detail).toContain('20 日均量的 1.1 倍');
  });
});
