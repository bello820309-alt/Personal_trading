import { describe, expect, it } from 'vitest';
import { fxOn, type FxDataFile } from '../../src/data/fx';
import { FX_START, normalizeFx, sameFx, stringifyFx, validateFx } from './fx';

/* 用 Yahoo 回應的結構手工組資料（不是真實匯率） */

// 2024-01-01 00:00 倫敦時間（冬令時間 = UTC）
const START = Date.UTC(2024, 0, 1) / 1000;

function yahooFx(rates: (number | null)[], opts: { start?: number; currency?: string } = {}) {
  const start = opts.start ?? START;
  return {
    chart: {
      result: [
        {
          meta: { currency: opts.currency ?? 'TWD', exchangeTimezoneName: 'Europe/London' },
          timestamp: rates.map((_, i) => start + i * 86400),
          indicators: { quote: [{ close: rates }] },
        },
      ],
      error: null,
    },
  };
}

const steady = (n: number, base = 31) => Array.from({ length: n }, (_, i) => base + Math.sin(i / 10) * 0.3);

describe('normalizeFx', () => {
  it('換成日期、拿掉今天還沒過完的那一筆、保留 4 位小數', () => {
    const rates = steady(10);
    rates[3] = 31.123456;
    // now = 第 10 天（索引 9）的中午 → 第 10 天是「今天」，不寫入
    const now = new Date((START + 9 * 86400 + 12 * 3600) * 1000);
    const { file, warnings } = normalizeFx(yahooFx(rates), now);
    expect(file.t[0]).toBe('2024-01-01');
    expect(file.t.length).toBe(9);
    expect(file.t.at(-1)).toBe('2024-01-09');
    expect(file.c[3]).toBe(31.1235);
    expect(file.id).toBe('USDTWD');
    expect(warnings).toEqual([]);
  });

  it('略過空值、不合理的數字，以及跳上去又跳回來的錯誤報價', () => {
    const rates: (number | null)[] = steady(12);
    rates[2] = null;
    rates[4] = 3.1; // 少一位數
    rates[6] = 34.5; // 突然 +10%，隔天又回來
    const now = new Date((START + 30 * 86400) * 1000);
    const { file, warnings } = normalizeFx(yahooFx(rates), now);
    expect(file.t).not.toContain('2024-01-03');
    expect(file.t).not.toContain('2024-01-05');
    expect(file.t).not.toContain('2024-01-07');
    expect(file.t.length).toBe(9);
    expect(warnings.join('')).toContain('不合理');
    expect(warnings.join('')).toContain('2024-01-07');
  });

  it('連續兩天往同一個方向大動不算錯誤（例如 2025 年 5 月台幣急升）', () => {
    const rates = [32.1, 32.0, 30.9, 29.6, 29.7, 29.8];
    const now = new Date((START + 30 * 86400) * 1000);
    const { file, warnings } = normalizeFx(yahooFx(rates), now);
    expect(file.c).toEqual(rates);
    expect(warnings).toEqual([]);
  });

  it(`只保留 ${FX_START} 以後`, () => {
    const start = Date.UTC(2009, 11, 30) / 1000;
    const { file } = normalizeFx(yahooFx(steady(5), { start }), new Date(Date.UTC(2024, 0, 1)));
    expect(file.t[0]).toBe('2010-01-01');
  });
});

describe('validateFx', () => {
  const now = new Date((START + 400 * 86400) * 1000);
  const good = normalizeFx(yahooFx(steady(300)), now).file;

  it('正常的資料沒有錯誤', () => {
    expect(validateFx(good, null, 'TWD')).toEqual([]);
  });

  it('幣別不對、資料太少、單日大跳、比上一版少很多，都會被擋下', () => {
    expect(validateFx(good, null, 'USD').join('')).toContain('幣別');
    const few = normalizeFx(yahooFx(steady(20)), now).file;
    expect(validateFx(few, null).join('')).toContain('太少');
    const jumpRates = steady(300);
    for (let i = 150; i < 300; i++) jumpRates[i] = jumpRates[i]! * 1.2;
    const jumped = normalizeFx(yahooFx(jumpRates), now).file;
    expect(validateFx(jumped, null).join('')).toContain('單日變動');
    const shorter = { ...good, t: good.t.slice(0, 280), c: good.c.slice(0, 280) };
    expect(validateFx(shorter, good).join('')).toContain('變少');
  });
});

describe('sameFx / stringifyFx', () => {
  it('內容一樣就視為沒有變化；輸出可以再讀回來', () => {
    const now = new Date((START + 30 * 86400) * 1000);
    const a = normalizeFx(yahooFx(steady(20)), now).file;
    const b: FxDataFile = { ...a, updatedAt: '2030-01-01T00:00:00.000Z' };
    expect(sameFx(a, b)).toBe(true);
    expect(sameFx(a, { ...a, c: a.c.map((x, i) => (i === 3 ? x + 0.01 : x)) })).toBe(false);
    expect(JSON.parse(stringifyFx(a))).toEqual(a);
  });
});

describe('fxOn', () => {
  const fx = { t: ['2026-11-02', '2026-11-03', '2026-11-05'], c: [32.1, 32.2, 32.4] };
  it('找當天或之前最近一天的匯率', () => {
    expect(fxOn(fx, '2026-11-03')).toEqual({ date: '2026-11-03', rate: 32.2 });
    expect(fxOn(fx, '2026-11-04')).toEqual({ date: '2026-11-03', rate: 32.2 });
    expect(fxOn(fx, '2026-11-09')).toEqual({ date: '2026-11-05', rate: 32.4 });
    expect(fxOn(fx, '2026-11-01')).toBeNull();
  });
  it('strict：不含當天', () => {
    expect(fxOn(fx, '2026-11-03', true)).toEqual({ date: '2026-11-02', rate: 32.1 });
    expect(fxOn(fx, '2026-11-02', true)).toBeNull();
  });
});
