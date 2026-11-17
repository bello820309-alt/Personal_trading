import { describe, expect, it } from 'vitest';
import { summaryText } from '../types';
import type { Candle } from '../../data/types';
import { obvIndicator } from './obv';

/* 價格一年漲很多、OBV 卻往下：用上漲日、下跌日的平均量說明原因 */

const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);

describe('OBV 一整年的方向', () => {
  it('下跌日的量比較大：價格漲、OBV 往下，寫出兩邊的平均量差幾倍', () => {
    // 400 天：漲 1.2%（量 100）、跌 0.8%（量 160）輪流，價格一路往上、OBV 一路往下
    const c: Candle[] = [];
    let close = 100;
    for (let i = 0; i < 400; i++) {
      const upDay = i % 2 === 1;
      if (i > 0) close *= upDay ? 1.012 : 0.992;
      c.push({ time: day(i), open: close, high: close, low: close, close, volume: upDay ? 100 : 160 });
    }
    const p = obvIndicator.defaults;
    const d = summaryText(obvIndicator.describe!(c, obvIndicator.compute(c, p), p)!);
    expect(d).toContain('放到一年來看：價格漲了');
    expect(d).toContain('OBV 卻往下');
    expect(d).toContain('下跌的日子平均成交量是上漲日子的 1.60 倍');
    expect(d).toContain('上漲、下跌的天數差不多');
  });

  it('價格和 OBV 方向一樣就不寫', () => {
    const c: Candle[] = Array.from({ length: 400 }, (_, i) => {
      const close = 100 + i * 0.1;
      return { time: day(i), open: close, high: close, low: close, close, volume: 100 };
    });
    const p = obvIndicator.defaults;
    expect(summaryText(obvIndicator.describe!(c, obvIndicator.compute(c, p), p)!)).not.toContain('放到一年來看');
  });
});
