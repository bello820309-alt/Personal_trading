import { describe, expect, it } from 'vitest';
import { INDICATORS } from './registry';
import { notesOf, summaryText } from './types';
import type { Candle } from '../data/types';

describe('指標說明的分層：結論＋補充說明', () => {
  it('notesOf 會略過沒有內容的項目、去掉前後空白', () => {
    expect(notesOf(['甲', ' 內容 '], ['乙', ''], ['丙', false], null, ['丁', undefined])).toEqual([{ title: '甲', text: '內容' }]);
    expect(notesOf(['乙', ''], false)).toBeUndefined();
  });

  it('summaryText 把結論和每一點說明接起來', () => {
    expect(summaryText({ tone: 'neutral', headline: 'h', detail: '結論。', notes: [{ title: 't', text: '說明。' }] })).toBe('結論。 說明。');
  });

  it('每個指標的結論都不超過 130 個字，補充說明的標題不重複', () => {
    // 幾種走勢都試：一路漲、一路跌、來回震盪後急跌
    const shapes = [
      (i: number) => 100 + i * 0.3,
      (i: number) => 200 - i * 0.3,
      (i: number) => 100 + 10 * Math.sin(i / 7) - (i > 380 ? (i - 380) * 1.5 : 0),
    ];
    for (const shape of shapes) {
      const candles: Candle[] = Array.from({ length: 400 }, (_, i) => {
        const close = shape(i);
        return { time: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), open: close, high: close + 1, low: close - 1, close, volume: 1000 + (i % 9) * 300 };
      });
      for (const def of INDICATORS) {
        let d;
        try {
          d = def.describe?.(candles, def.compute(candles, def.defaults, {}), def.defaults);
        } catch {
          continue; // 需要額外資料的指標
        }
        if (!d) continue;
        expect(d.detail.length, `${def.id}：${d.detail}`).toBeLessThanOrEqual(130);
        const titles = (d.notes ?? []).map((n) => n.title);
        expect(new Set(titles).size, `${def.id}：${titles.join('、')}`).toBe(titles.length);
      }
    }
  });
});
