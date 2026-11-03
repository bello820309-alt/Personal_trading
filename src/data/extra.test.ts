import { describe, expect, it } from 'vitest';
import { alignToCandles, fromCompact, lastDate, toCompact, valueOn } from './extra';
import type { Candle } from './types';

const k = (time: string, endTime?: string): Candle => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1, ...(endTime ? { endTime } : {}) });

describe('比特幣額外資料的儲存格式', () => {
  it('起始日＋數值陣列，缺的日子補 null，可以還原', () => {
    const c = toCompact(['2024-01-01', '2024-01-02', '2024-01-05'], [10, 20, 50]);
    expect(c).toEqual({ start: '2024-01-01', v: [10, 20, null, null, 50] });
    expect(fromCompact(c)).toEqual({ t: ['2024-01-01', '2024-01-02', '2024-01-05'], v: [10, 20, 50] });
    expect(valueOn(c, '2024-01-02')).toBe(20);
    expect(valueOn(c, '2024-01-03')).toBeNull();
    expect(valueOn(c, '2023-12-31')).toBeNull();
    expect(lastDate(c)).toBe('2024-01-05');
    expect(toCompact([], [])).toEqual({ start: '', v: [] });
  });

  it('對齊到 K 棒：取那根 K 棒最後一天的值；沒資料時往前找最多 3 天', () => {
    const c = toCompact(['2024-01-01', '2024-01-02', '2024-01-05', '2024-01-06'], [1, 2, 5, 6]);
    const candles = [k('2024-01-01'), k('2024-01-04'), k('2024-01-01', '2024-01-07'), k('2024-01-12'), k('2023-12-01')];
    expect(alignToCandles(c, candles)).toEqual([1, 2, 6, null, null]);
    expect(alignToCandles(undefined, candles)).toEqual([null, null, null, null, null]);
  });
});
