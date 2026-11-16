import { describe, expect, it } from 'vitest';
import type { Candle } from '../../data/types';
import { kdIndicator, kdSeries } from './kd';

/* KD 的說明要用當天實際的 RSV、K、D 寫出來，不能用固定的句子 */

const day = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);
const mk = (closes: number[]): Candle[] =>
  closes.map((close, i) => ({ time: day(i), open: close, high: close + 1, low: close - 1, close, volume: 100 }));
const p = kdIndicator.defaults;
const describeKd = (c: Candle[]) => kdIndicator.describe!(c, kdIndicator.compute(c, p), p)!;

describe('KD 的說明', () => {
  it('交叉那天價格反向：寫出那天的 RSV、前一天的 K，以及 K 被拉到多少', () => {
    // 一路跌到 101，10/21 小漲到 101.1，10/22 小跌到 101.0 卻黃金交叉
    const c = mk([...Array.from({ length: 20 }, (_, i) => 120 - i), 101.1, 101.0]);
    const { rsv, k, d } = kdSeries(c, 9, 3, 3);
    const n = c.length;
    expect(k[n - 2]! <= d[n - 2]! && k[n - 1]! > d[n - 1]!).toBe(true);
    const text = describeKd(c).detail;
    expect(text).toContain('最近一次交叉是 10/22 的黃金交叉');
    expect(text).toContain('那天價格其實跌了 0.10%');
    // 最近 9 天：最低是 10/20 的 100（101 − 1），最高是 10/14 的 108（107 + 1）
    expect(text).toContain('最近 9 天最低是 10/20 的 100.00、最高是 10/14 的 108.00');
    expect(text).toContain(`RSV ${rsv[n - 1]!.toFixed(1)}`);
    expect(text).toContain(`前一天的 K 是 ${k[n - 2]!.toFixed(1)}，RSV 比它高`);
    expect(text).toContain('K 每天只往 RSV 靠近 1/3');
    expect(text).not.toContain('盤中低點拉得很低');
  });

  it('大跌當天 K 還在 D 之上：用實際的數字說明 K 為什麼還沒翻過來', () => {
    // 從 120 跌到 100.5，反彈到 108，今天跌 4.5%（108 → 103.14）
    const closes = [...Array(10).fill(120), ...Array.from({ length: 8 }, (_, i) => 118 - i * 2.5), 102, 104, 106, 108];
    const c = mk([...closes, 103.14]);
    const { k, d } = kdSeries(c, 9, 3, 3);
    const n = c.length;
    expect(k[n - 1]! > d[n - 1]! && k[n - 1]! < 80).toBe(true);
    const r = describeKd(c);
    expect(r.headline).toContain('K 在 D 之上');
    expect(r.detail).toContain('今天跌了 4.50%，K 卻還在 D 之上');
    expect(r.detail).toContain(`前一天的 K 是 ${k[n - 2]!.toFixed(1)}`);
    expect(r.detail).toContain(`K 只降到 ${k[n - 1]!.toFixed(1)}，還在 D（${d[n - 1]!.toFixed(1)}）之上`);
  });

  it('均線方向寫「往上彎、走平」，不寫「走平彎」', () => {
    const c = mk(Array.from({ length: 80 }, (_, i) => 100 + i));
    const text = describeKd(c).detail;
    expect(text).toContain('20 日均線往上彎、60 日均線往上彎');
    expect(text).not.toContain('走平彎');
  });
});
