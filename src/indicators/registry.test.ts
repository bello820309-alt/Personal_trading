import { describe, expect, it } from 'vitest';
import type { Candle } from '../data/types';
import { computeIndicator, describeOf, getIndicator } from './registry';

const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);

describe('每個有回測規則的指標，都寫出最近一次訊號', () => {
  it('MACD：最近一次訊號是哪天、第幾根（訊號那天算第 1 根）、回測裡是不是還沒賣出', () => {
    // 先跌後漲：最後出現黃金交叉（買進）之後一路漲，沒有再死亡交叉
    const closes = [...Array.from({ length: 80 }, (_, i) => 200 - i), ...Array.from({ length: 30 }, (_, i) => 121 + i * 2)];
    const candles: Candle[] = closes.map((close, i) => ({ time: day(i), open: close, high: close + 1, low: close - 1, close, volume: 1 }));
    const d = describeOf(computeIndicator(getIndicator('macd')!, candles, 'us', null), candles)!;
    const note = d.notes!.find((x) => x.title === '最近一次回測訊號')!;
    expect(note.text).toMatch(/^\d+\/\d+出現買進訊號（MACD 黃金交叉），算到今天是第 \d+ 根 K 棒（訊號那天算第 1 根）。/);
    expect(note.text).toContain('這一筆現在還沒賣出');
  });
});
