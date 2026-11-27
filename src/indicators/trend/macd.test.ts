import { describe, expect, it } from 'vitest';
import type { Candle } from '../../data/types';
import type { IndicatorResult } from '../types';
import { macdIndicator } from './macd';

const candles = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: `2026-11-${String(i + 1).padStart(2, '0')}`, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
const result = (dif: number[], sig: number[]): IndicatorResult => ({
  lines: [
    { key: 'dif', label: 'DIF', values: dif, kind: 'line', color: 's0' },
    { key: 'macd', label: 'MACD', values: sig, kind: 'line', color: 's1' },
    { key: 'osc', label: 'OSC', values: dif.map((x, i) => x - sig[i]!), kind: 'histogram', color: 'hot' },
  ],
});

describe('MACD 卡片：今天剛交叉', () => {
  it('柱狀體從負的翻成正的：不說「縮小、力道減弱」，改寫剛交叉、差距很小', () => {
    // 柱狀體：-0.5 → -0.2 → +0.003（昨天的絕對值比今天大，原本會被說成「縮小」）
    const d = macdIndicator.describe!(candles(3), result([-4.5, -4.2, -3.987], [-4, -4, -3.99]), macdIndicator.defaults)!;
    expect(d.detail).toContain('今天剛從負值翻成正值');
    expect(d.detail).not.toContain('縮小');
    expect(d.detail).not.toContain('減弱');
    const note = d.notes!.find((n) => n.title === '剛交叉算不算數')!;
    expect(note.text).toContain('0.003');
  });

  it('沒有換邊時照舊說放大或縮小', () => {
    const d = macdIndicator.describe!(candles(3), result([-4.5, -4.2, -4.1], [-4, -4, -4]), macdIndicator.defaults)!;
    expect(d.detail).toContain('縮小');
    expect(d.notes!.some((n) => n.title === '柱狀體變幾天才算數')).toBe(true);
  });
});
