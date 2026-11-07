import { describe, expect, it } from 'vitest';
import type { ExtraDataFile } from '../../data/extra';
import type { Candle } from '../../data/types';
import { fearGreedIndicator } from './fearGreed';

/* 每天早上 8 點公布的數字對應「當天」的日 K：那根還沒收盤時，說明裡要寫出已經公布的新數字 */

const bar = (time: string): Candle => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });
const extra = (start: string, v: number[]) =>
  ({ schemaVersion: 1, asset: 'BTC', updatedAt: '', series: { fng: { label: '', unit: '', source: '', start, v } } }) as unknown as ExtraDataFile;

describe('恐懼貪婪：比最後一根 K 棒還新的數字', () => {
  const p = fearGreedIndicator.defaults;

  it('最後一根是 11/6、11/7 早上的數字已經公布：說明裡寫出新數字和它什麼時候會畫上去', () => {
    const candles = [bar('2026-11-05'), bar('2026-11-06')];
    const r = fearGreedIndicator.compute(candles, p, { extra: extra('2026-11-05', [50, 28, 25]) });
    expect(r.newer).toEqual({ date: '2026-11-07', value: 25 });
    const d = fearGreedIndicator.describe!(candles, r, p)!;
    expect(d.headline).toBe('恐懼貪婪指數 28：恐懼');
    expect(d.detail).toContain('11/6 台灣時間早上 8 點公布');
    expect(d.detail).toContain('11/7 早上 8 點是 25（恐懼）');
  });

  it('有當天的即時 K 棒時（網頁上有即時報價），新數字就直接對到那一根，不另外說明', () => {
    const candles = [bar('2026-11-05'), bar('2026-11-06'), bar('2026-11-07')];
    const r = fearGreedIndicator.compute(candles, p, { extra: extra('2026-11-05', [50, 28, 25]) });
    expect(r.newer).toBeUndefined();
    expect(fearGreedIndicator.describe!(candles, r, p)!.headline).toBe('恐懼貪婪指數 25：恐懼');
  });
});
