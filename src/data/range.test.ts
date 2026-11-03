import { describe, expect, it } from 'vitest';
import { indexOfTime, rangeStats } from './range';
import type { Candle } from './types';

const bar = (time: string, open: number, high: number, low: number, close: number, endTime?: string): Candle => ({
  time,
  open,
  high,
  low,
  close,
  volume: 1,
  ...(endTime ? { endTime } : {}),
});

// 這些是手工編的 K 棒，只用來驗證計算方式（不是真實行情）
const days: Candle[] = [
  bar('2026-10-01', 100, 103, 99, 102),
  bar('2026-10-02', 102, 108, 101, 107),
  bar('2026-10-05', 107, 107, 95, 96),
  bar('2026-10-06', 96, 99, 94, 98),
  bar('2026-11-02', 98, 112, 97, 110),
];

describe('rangeStats（圖表上的區間漲跌）', () => {
  it('從起點的開盤價算到終點的收盤價，並算出天數、根數、區間最高與最低', () => {
    const r = rangeStats(days, 0, 4)!;
    expect(r.startPrice).toBe(100);
    expect(r.endPrice).toBe(110);
    expect(r.change).toBe(10);
    expect(r.changePct).toBeCloseTo(0.1, 10);
    expect(r.bars).toBe(5);
    expect(r.days).toBe(32);
    expect([r.high, r.highIdx]).toEqual([112, 4]);
    expect([r.low, r.lowIdx]).toEqual([94, 3]);
  });

  it('先選終點再選起點也一樣', () => {
    expect(rangeStats(days, 3, 1)).toEqual(rangeStats(days, 1, 3));
    const r = rangeStats(days, 3, 1)!;
    expect([r.from, r.to, r.startPrice, r.endPrice]).toEqual([1, 3, 102, 98]);
    expect(r.changePct).toBeCloseTo(98 / 102 - 1, 10);
  });

  it('只選一根：就是那根 K 棒自己的開盤到收盤', () => {
    const r = rangeStats(days, 2, 2)!;
    expect([r.bars, r.days, r.startPrice, r.endPrice]).toEqual([1, 0, 107, 96]);
  });

  it('週 K：天數算到最後一週的最後一個交易日', () => {
    const weeks = [bar('2026-10-05', 10, 12, 9, 11, '2026-10-09'), bar('2026-10-12', 11, 13, 10, 12, '2026-10-16')];
    expect(rangeStats(weeks, 0, 1)!.days).toBe(11);
  });

  it('超出範圍的位置會被夾在第一根和最後一根之間；沒有資料時回傳 null', () => {
    expect(rangeStats(days, -3, 99)).toEqual(rangeStats(days, 0, 4));
    expect(rangeStats([], 0, 1)).toBeNull();
  });
});

describe('indexOfTime', () => {
  it('找得到就回傳位置，找不到回傳 -1', () => {
    expect(indexOfTime(days, '2026-10-01')).toBe(0);
    expect(indexOfTime(days, '2026-10-06')).toBe(3);
    expect(indexOfTime(days, '2026-11-02')).toBe(4);
    expect(indexOfTime(days, '2026-10-03')).toBe(-1);
    expect(indexOfTime([], '2026-10-03')).toBe(-1);
  });
});
