import { describe, expect, it } from 'vitest';
import { fmtBarDate } from './format';
import { resample } from './resample';
import type { Candle } from './types';

function c(time: string, close: number): Candle {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 10 };
}

describe('週 K／月 K', () => {
  const daily = [c('2026-10-26', 1), c('2026-10-27', 2), c('2026-11-01', 3), c('2026-11-02', 4)];

  it('週 K 記下這一週的第一天和最後一天', () => {
    const { candles } = resample(daily, 'W');
    expect(candles.map((x) => [x.time, x.endTime, x.close])).toEqual([
      ['2026-10-26', '2026-11-01', 3],
      ['2026-11-02', '2026-11-02', 4],
    ]);
    expect(candles[0]!.volume).toBe(30);
  });

  it('日 K 不加 endTime', () => {
    expect(resample(daily, 'D').candles[0]!.endTime).toBeUndefined();
  });

  it('日期顯示：週 K 是區間，日 K 是單一天', () => {
    expect(fmtBarDate('2026-10-26', '2026-11-01')).toBe('2026/10/26～11/01');
    expect(fmtBarDate('2025-12-29', '2026-01-02')).toBe('2025/12/29～2026/01/02');
    expect(fmtBarDate('2026-11-02')).toBe('2026/11/02');
  });
});
