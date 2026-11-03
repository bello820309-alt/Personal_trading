import { describe, expect, it } from 'vitest';
import type { Candle } from '../data/types';
import { analogForecast, buildFeatures, calendarFor, findAnalogs, forwardPath, horizonsFor, outcomeStats, standardize, walkForwardCheck } from './analog';

/* 用人工產生的價格（不是真實行情）驗證方法本身：週期性的價格應該幾乎猜得中，隨機漫步應該接近擲硬幣 */

const crypto = { tradesOnWeekends: true };
const stock = { tradesOnWeekends: false };

function series(n: number, f: (i: number) => number): Candle[] {
  const t0 = Date.UTC(2010, 0, 1);
  return Array.from({ length: n }, (_, i) => {
    const close = f(i);
    return { time: new Date(t0 + i * 86400000).toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1 };
  });
}

/** 每 50 天重複一次的價格：過去會完全重演 */
const periodic = series(2400, (i) => 100 * Math.exp(0.2 * Math.sin((2 * Math.PI * i) / 50)));

/** 固定亂數種子的隨機漫步 */
function randomWalk(n: number, seed = 7): Candle[] {
  let s = seed >>> 0;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  let p = 100;
  return series(n, () => (p *= Math.exp((rand() - 0.5) * 0.06)));
}

describe('期間與特徵', () => {
  it('比特幣用日曆天、股票用交易日', () => {
    expect(horizonsFor(crypto).map((h) => h.bars)).toEqual([7, 30, 90]);
    expect(horizonsFor(stock).map((h) => h.bars)).toEqual([5, 21, 63]);
  });

  it('特徵只用當天以前的資料；資料不夠一年的前段是 null', () => {
    const c = series(500, (i) => 100 + i);
    const f = buildFeatures(c, calendarFor(crypto));
    expect(f[364]).toBeNull();
    const row = f[400]!;
    expect(row[0]).toBeCloseTo(500 / 493 - 1, 12); // 近 1 週
    expect(row[4]).toBeCloseTo(500 / 410 - 1, 12); // 近 3 個月
    expect(row[8]).toBeCloseTo(0, 12); // 一路上漲：今天就是一年內最高點
    // 後面的資料改變，不會影響前面的特徵
    const changed = series(500, (i) => (i > 450 ? 1 : 100 + i));
    expect(buildFeatures(changed, calendarFor(crypto))[400]).toEqual(row);
  });
});

describe('找相似的日子', () => {
  it('只從 maxIdx 以前找，而且彼此至少相隔 minGap', () => {
    const z = standardize(buildFeatures(periodic, calendarFor(crypto)));
    const target = periodic.length - 1;
    const a = findAnalogs(z, target, { k: 10, minGap: 30, maxIdx: target - 90 });
    expect(a).toHaveLength(10);
    expect(a.every((x) => x.index <= target - 90)).toBe(true);
    for (const x of a) for (const y of a) if (x !== y) expect(Math.abs(x.index - y.index)).toBeGreaterThanOrEqual(30);
    // 週期是 50 天：最像的日子和現在相差 50 天的整數倍
    expect(a.slice(0, 5).every((x) => (target - x.index) % 50 === 0)).toBe(true);
  });

  it('之後的走勢與統計', () => {
    const c = series(10, (i) => 100 + 10 * i);
    const path = forwardPath(c, 2, 3);
    [0, 10 / 120, 20 / 120, 30 / 120].forEach((v, i) => expect(path[i]).toBeCloseTo(v, 12));
    expect(outcomeStats([0.1, -0.2, 0.3, 0.05])).toMatchObject({ n: 4, up: 0.75, median: expect.closeTo(0.075, 12) });
    expect(outcomeStats([])).toBeNull();
  });
});

describe('預測與回頭檢驗', () => {
  it('週期性的價格：預測區間很窄，回頭檢驗幾乎每次都猜對', () => {
    const f = analogForecast(periodic, crypto)!;
    expect(f.analogs.length).toBe(30);
    expect(f.cone[0]).toEqual({ k: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 });
    for (const p of f.cone) expect(p.p10 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p90).toBe(true);
    const check = walkForwardCheck(periodic, crypto, { years: 3 });
    for (const r of check) {
      expect(r.tests).toBeGreaterThan(100);
      expect(r.hit).toBeGreaterThan(0.95);
    }
  });

  it('隨機漫步：猜對的比例接近一半（過去的走勢對未來沒有幫助）', () => {
    const check = walkForwardCheck(randomWalk(2400), crypto, { years: 4 });
    const m = check.find((r) => r.horizon.key === '1m')!;
    expect(m.tests).toBeGreaterThan(150);
    expect(m.hit).toBeGreaterThan(0.35);
    expect(m.hit).toBeLessThan(0.65);
    expect(m.coverage).toBeGreaterThan(0.5);
  });

  it('資料太短時不預測', () => {
    expect(analogForecast(series(300, (i) => 100 + i), crypto)).toBeNull();
  });
});
