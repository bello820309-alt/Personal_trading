import { describe, expect, it } from 'vitest';
import type { Candle } from '../../data/types';
import { supertrendIndicator } from './supertrend';

/* SuperTrend 的說明要寫出是哪一天翻多（翻空），剛翻的時候提醒還沒確認 */

const day = (i: number) => new Date(Date.UTC(2026, 8, 1) + i * 86400000).toISOString().slice(0, 10);

describe('SuperTrend 翻多的日期', () => {
  it('一路跌、最後一天大漲翻多：寫出今天翻多、還沒經過 2～3 天的確認', () => {
    const closes = [...Array.from({ length: 40 }, (_, i) => 100 - i * 0.5), 130];
    const c: Candle[] = closes.map((close, i) => ({ time: day(i), open: close, high: close + 0.5, low: close - 0.5, close, volume: 1 }));
    const p = supertrendIndicator.defaults;
    const d = supertrendIndicator.describe!(c, supertrendIndicator.compute(c, p), p)!;
    expect(d.tone).toBe('bullish');
    expect(d.detail).toContain(`${Number(day(40).slice(5, 7))}/${Number(day(40).slice(8, 10))} 翻多，到今天是第 1 根 K 棒，還沒經過 2～3 天的確認`);
  });
});
