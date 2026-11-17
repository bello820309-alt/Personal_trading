import { describe, expect, it } from 'vitest';
import type { Candle } from '../../data/types';
import { SQUEEZE_AFTER, squeezeHistory, squeezeHistoryText, squeezeStatus, squeezeText } from './squeeze';

/* 布林、肯特納兩張卡片共用的「擠壓」判斷：兩種說法各自成不成立都要寫出來 */

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);

describe('擠壓的兩種說法', () => {
  it('收盤價擠在一起、每天盤中震幅很大：縮進肯特納通道裡，但寬度不是半年最窄', () => {
    // 前 150 天收盤價大幅擺動（布林通道很寬），最近 30 天收盤幾乎不動、盤中震幅很大
    const c: Candle[] = Array.from({ length: 180 }, (_, i) => {
      const close = i < 150 ? 100 + 3 * Math.sin(i / 4) : 100 + 0.3 * Math.sin(i);
      const range = i < 150 ? 0.5 : 3;
      return { time: day(i), open: close, high: close + range, low: close - range, close, volume: 1 };
    });
    const st = squeezeStatus(c)!;
    expect(st.inside).toBe(true);
    const text = squeezeText(st, c[c.length - 1]!.close);
    expect(text).toContain('整個縮在肯特納通道');
    expect(text).toContain('擠壓是「相對」的說法');
    if (!st.nearMin) expect(text).toContain('兩種說法只有一種成立');
  });

  it('一路上漲、盤中震幅很小：兩種擠壓都沒有，並寫出是半年最窄時的幾倍', () => {
    const c: Candle[] = Array.from({ length: 180 }, (_, i) => {
      const close = 100 * 1.004 ** i * (i > 160 ? 1.02 ** (i - 160) : 1);
      return { time: day(i), open: close, high: close + 0.1, low: close - 0.1, close, volume: 1 };
    });
    const st = squeezeStatus(c)!;
    expect(st.inside).toBe(false);
    expect(st.nearMin).toBe(false);
    const text = squeezeText(st, c[c.length - 1]!.close);
    expect(text).toContain('現在沒有「擠壓」');
    expect(text).toMatch(/最近半年最窄時的 \d+\.\d\d 倍/);
  });

  it('資料不到 80 天（半年寬度不夠 60 天）就不判斷', () => {
    const c: Candle[] = Array.from({ length: 60 }, (_, i) => ({ time: day(i), open: 100, high: 101, low: 99, close: 100 + (i % 3), volume: 1 }));
    expect(squeezeStatus(c)).toBeNull();
  });

  it('擠壓之後實際怎麼走：數出有擠壓的日子之後的漲跌幅度，和所有日子比', () => {
    // 前 200 天幾乎不動（一直擠壓），之後每天大幅來回
    const c: Candle[] = Array.from({ length: 400 }, (_, i) => {
      const close = i < 200 ? 100 + 0.2 * Math.sin(i) : 100 + 8 * Math.sin(i / 3);
      return { time: day(i), open: close, high: close + 2, low: close - 2, close, volume: 1 };
    });
    const h = squeezeHistory(c)!;
    expect(h.days).toBeGreaterThan(50);
    expect(h.allDays).toBeGreaterThan(h.days);
    // 擠壓的日子大多在前半段（幾乎不動），之後的幅度比所有日子小
    expect(h.avgMove).toBeLessThan(h.allAvgMove);
    const text = squeezeHistoryText(c);
    expect(text).toContain(`有擠壓的日子有 ${h.days} 天，之後 ${SQUEEZE_AFTER} 根 K 棒的漲跌幅度`);
    expect(text).toContain('反而比平常小');
    // 說明裡也帶得到這句
    expect(squeezeText(squeezeStatus(c)!, 100, text)).toContain('教科書常說「擠壓之後會有大行情」');
  });
});
