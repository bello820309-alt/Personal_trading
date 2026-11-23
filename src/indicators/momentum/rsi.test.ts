import { describe, expect, it } from 'vitest';
import type { Candle } from '../../data/types';
import { summaryText } from '../types';
import { divergenceText, rsiIndicator } from './rsi';

const day = (i: number) => new Date(Date.UTC(2026, 6, 1) + i * 86400000).toISOString().slice(0, 10);
const mk = (closes: number[]): Candle[] => closes.map((close, i) => ({ time: day(i), open: close, high: close + 1, low: close - 1, close, volume: 1 }));

describe('RSI 的背離和今天的訊號', () => {
  it('價格創新低、指標沒有：寫出兩個低點和指標數值，說符合底背離', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 - i * 0.2);
    const line = closes.map(() => 40);
    closes[25] = 80; line[25] = 15; // 前一個低點：RSI 很低
    closes[55] = 78; line[55] = 25; // 最近的低點：價格更低、RSI 比較高
    const text = divergenceText(mk(closes), line, 'RSI(14)', 'low');
    expect(text).toContain('最近 10 根 K 棒收盤最低是 8/25 的 78.00（RSI(14) 25.0）');
    expect(text).toContain('再往前 11～40 根之間最低是 7/26 的 80.00（RSI(14) 15.0）');
    expect(text).toContain('符合「底背離」的樣子');
  });

  it('價格和指標一起創新低：沒有背離', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 - i * 0.2);
    const line = closes.map(() => 40);
    closes[25] = 80; line[25] = 25;
    closes[55] = 78; line[55] = 15;
    expect(divergenceText(mk(closes), line, 'RSI(14)', 'low')).toContain('方向一致，沒有背離');
  });

  it('今天剛從超賣門檻以下回到門檻以上：寫出這就是回測的買進訊號', () => {
    // 一路跌讓 RSI 很低，最後兩天大漲讓 RSI 回到 30 以上
    const closes = [...Array.from({ length: 60 }, (_, i) => 100 - i), 45, 50];
    const c = mk(closes);
    const p = rsiIndicator.defaults;
    const r = rsiIndicator.compute(c, p);
    const rsi = r.lines[0]!.values;
    const n = c.length;
    // 找到剛好穿越的那一天當作今天
    let k = -1;
    for (let i = 1; i < n; i++) if ((rsi[i - 1] ?? 100) < p.oversold && (rsi[i] ?? 0) >= p.oversold) k = i;
    expect(k).toBeGreaterThan(0);
    const cut = c.slice(0, k + 1);
    const d = rsiIndicator.describe!(cut, rsiIndicator.compute(cut, p), p)!;
    expect(summaryText(d)).toContain(`從 ${p.oversold} 以下回到 ${p.oversold} 以上，這就是本站回測規則的買進訊號`);
  });
});
