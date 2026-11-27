import { describe, expect, it } from 'vitest';
import type { Candle } from '../../data/types';
import { getLine } from '../types';
import { biasIndicator, trailingQuantile } from './bias';

/* 卡片的「負乖離過大」要和回測訊號用同一條門檻線，不能一個說是、一個說不是 */

const day = (i: number) => new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);

describe('乖離率卡片和回測訊號的門檻一致', () => {
  it('每一天：卡片說負乖離過大，若且唯若乖離率低於回測用的門檻線', () => {
    // 有起有落的價格，取很多個結尾來比
    const closes = Array.from({ length: 700 }, (_, i) => 100 + 15 * Math.sin(i / 17) + 6 * Math.sin(i / 5) + i * 0.02);
    const all: Candle[] = closes.map((close, i) => ({ time: day(i), open: close, high: close + 1, low: close - 1, close, volume: 1 }));
    const p = biasIndicator.defaults;
    let checked = 0;
    for (let end = 400; end <= all.length; end += 7) {
      const c = all.slice(0, end);
      const r = biasIndicator.compute(c, p);
      const bias = getLine(r, 'bias');
      const th = trailingQuantile(bias, p.lookback, p.percentile, Math.floor(p.lookback / 2))[end - 1];
      const v = bias[end - 1];
      if (th == null || v == null) continue;
      const d = biasIndicator.describe!(c, r, p)!;
      expect(d.headline.includes('負乖離過大'), `第 ${end} 根：${v} vs ${th}`).toBe(v < th);
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('門檻線每天重算：最近一次訊號那天的門檻和今天不同', () => {
  it('寫出最近一次跌破門檻是哪天、那天的乖離率和當天的門檻線，數字和回測一致', () => {
    const closes = Array.from({ length: 700 }, (_, i) => 100 + 15 * Math.sin(i / 17) + 6 * Math.sin(i / 5) + i * 0.02);
    const all: Candle[] = closes.map((close, i) => ({ time: day(i), open: close, high: close + 1, low: close - 1, close, volume: 1 }));
    const p = biasIndicator.defaults;
    const r = biasIndicator.compute(all, p);
    const sigs = biasIndicator.signals!(all, r, p).filter((s) => s.side === 'buy');
    const last = sigs[sigs.length - 1]!;
    expect(last.index).toBeLessThan(all.length - 1);
    const bias = getLine(r, 'bias');
    const th = trailingQuantile(bias, p.lookback, p.percentile, Math.floor(p.lookback / 2));
    const t = all[last.index]!.time;
    const md = `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))}`;
    const text = biasIndicator.describe!(all, r, p)!.notes!.map((x) => x.text).join('');
    const pct = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
    expect(text).toContain(`最近一次跌破門檻（回測的買進訊號）是 ${md}，那天乖離率 ${pct(bias[last.index]!)}，當天的門檻線是 ${pct(th[last.index]!)}`);
  });
});
