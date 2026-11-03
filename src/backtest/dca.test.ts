import { describe, expect, it } from 'vitest';
import type { Candle } from '../data/types';
import { dcaDays, defaultPlan, plainPlan, runDca, sanitizePlan, xirr, zoneAt, type DcaPlan } from './dca';

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 從 start 開始的日 K；weekdaysOnly 時只有星期一到五（像股票） */
function candlesFrom(start: string, closes: number[], weekdaysOnly = false): Candle[] {
  const out: Candle[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  for (const c of closes) {
    while (weekdaysOnly && [0, 6].includes(new Date(t).getUTCDay())) t += DAY;
    out.push({ time: iso(t), open: c, high: c, low: c, close: c, volume: 1 });
    t += DAY;
  }
  return out;
}

const NO_COST = { feeRate: 0, sellTaxRate: 0 };
const BTC_PLAN = defaultPlan('BTC', 80000);

describe('zoneAt：價格落在哪一階', () => {
  it('使用者的例子：基準 8 萬每週 100、跌到 7 萬 120、6 萬 150、9 萬 50、10 萬 30、11 萬賣 10%、12 萬賣 20%', () => {
    const act = (p: number) => zoneAt(BTC_PLAN, p).action;
    expect(act(80000)).toEqual({ kind: 'buy', amount: 100 });
    expect(act(75000)).toEqual({ kind: 'buy', amount: 100 });
    expect(act(89999)).toEqual({ kind: 'buy', amount: 100 });
    expect(act(70000)).toEqual({ kind: 'buy', amount: 120 }); // 碰到門檻就算
    expect(act(65000)).toEqual({ kind: 'buy', amount: 120 });
    expect(act(50000)).toEqual({ kind: 'buy', amount: 150 });
    expect(act(90000)).toEqual({ kind: 'buy', amount: 50 });
    expect(act(105000)).toEqual({ kind: 'buy', amount: 30 });
    expect(act(110000)).toEqual({ kind: 'sell', pct: 10 });
    expect(act(130000)).toEqual({ kind: 'sell', pct: 20 });
  });
});

describe('dcaDays：哪幾天要操作', () => {
  it('每週：比特幣（每天都有 K 棒）是每個星期一；第一天一定操作', () => {
    // 2026-01-07 是星期三
    const c = candlesFrom('2026-01-07', new Array(21).fill(100));
    expect(dcaDays(c, 0, c.length - 1, 'weekly').map((i) => c[i]!.time)).toEqual(['2026-01-07', '2026-01-12', '2026-01-19', '2026-01-26']);
  });

  it('每週：股票是每週第一個交易日；每月是每個月第一個交易日', () => {
    const c = candlesFrom('2026-01-01', new Array(45).fill(100), true);
    const weekly = dcaDays(c, 0, c.length - 1, 'weekly').map((i) => c[i]!.time);
    expect(weekly.slice(0, 3)).toEqual(['2026-01-01', '2026-01-05', '2026-01-12']);
    const monthly = dcaDays(c, 0, c.length - 1, 'monthly').map((i) => c[i]!.time);
    expect(monthly).toEqual(['2026-01-01', '2026-02-02', '2026-03-02']);
  });

  it('每兩週：從第一週開始每隔一週', () => {
    const c = candlesFrom('2026-01-05', new Array(35).fill(100));
    expect(dcaDays(c, 0, c.length - 1, 'biweekly').map((i) => c[i]!.time)).toEqual(['2026-01-05', '2026-01-19', '2026-02-02']);
  });
});

describe('runDca', () => {
  it('一般定投：價格不變時，投入多少就值多少（扣掉手續費）', () => {
    const c = candlesFrom('2026-01-05', new Array(28).fill(100));
    const r = runDca(c, 0, c.length - 1, plainPlan(BTC_PLAN), { feeRate: 0.001, sellTaxRate: 0 });
    expect(r.buys).toBe(4);
    expect(r.invested).toBe(400);
    expect(r.units).toBeCloseTo((4 * 100 * 0.999) / 100, 10);
    expect(r.returnPct).toBeCloseTo(-0.001, 10);
    expect(r.avgCost).toBeCloseTo(100 / 0.999, 8);
  });

  it('跌越多買越多：價格在 6 萬以下的那幾週買 150', () => {
    const closes = [...new Array(7).fill(80000), ...new Array(7).fill(55000), ...new Array(7).fill(95000)];
    const c = candlesFrom('2026-01-05', closes);
    const r = runDca(c, 0, c.length - 1, BTC_PLAN, NO_COST);
    expect(r.events.map((e) => e.cash)).toEqual([100, 150, 50]);
    expect(r.invested).toBe(300);
  });

  it('每期都賣：價格停在 11 萬以上的每一週都賣出持有的 10%', () => {
    const closes = [...new Array(14).fill(80000), ...new Array(21).fill(115000)];
    const c = candlesFrom('2026-01-05', closes);
    const r = runDca(c, 0, c.length - 1, BTC_PLAN, NO_COST);
    const bought = (2 * 100) / 80000;
    expect(r.sells).toBe(3);
    expect(r.units).toBeCloseTo(bought * 0.9 ** 3, 12);
    expect(r.cashOut).toBeCloseTo((bought - bought * 0.9 ** 3) * 115000, 8);
  });

  it('每個價位只賣一次；跌回基準價格以下後重新啟動', () => {
    const plan: DcaPlan = { ...BTC_PLAN, sellMode: 'once' };
    const closes = [
      ...new Array(14).fill(80000), // 買兩次
      ...new Array(21).fill(115000), // 只在第一週賣 10%
      ...new Array(7).fill(75000), // 跌回 8 萬以下：重新啟動，這週買 100
      ...new Array(7).fill(116000), // 再賣一次 10%
    ];
    const c = candlesFrom('2026-01-05', closes);
    const r = runDca(c, 0, c.length - 1, plan, NO_COST);
    expect(r.events.map((e) => e.kind)).toEqual(['buy', 'buy', 'sell', 'buy', 'sell']);
  });

  it('只賣一次的模式下，一次跳過兩個價位時兩個都會賣', () => {
    const plan: DcaPlan = { ...BTC_PLAN, sellMode: 'once' };
    const c = candlesFrom('2026-01-05', [...new Array(7).fill(80000), ...new Array(7).fill(125000)]);
    const r = runDca(c, 0, c.length - 1, plan, NO_COST);
    const sells = r.events.filter((e) => e.kind === 'sell');
    expect(sells.map((e) => plan.rules[e.ruleIndex]!.price)).toEqual([110000, 120000]);
    expect(r.units).toBeCloseTo((100 / 80000) * 0.9 * 0.8, 12);
  });

  it('賣出時扣手續費與交易稅', () => {
    const c = candlesFrom('2026-01-05', [...new Array(7).fill(80000), ...new Array(7).fill(115000)]);
    const r = runDca(c, 0, c.length - 1, BTC_PLAN, { feeRate: 0.001, sellTaxRate: 0.003 });
    const units = (100 * 0.999) / 80000;
    expect(r.cashOut).toBeCloseTo(units * 0.1 * 115000 * (1 - 0.001 - 0.003), 8);
  });
});

describe('xirr', () => {
  it('投入 100、一年後拿回 110 → 年化 10%', () => {
    expect(xirr([{ day: 0, v: -100 }, { day: 365, v: 110 }])).toBeCloseTo(0.1, 6);
  });

  it('期中再投入：結果讓所有現金流折現後加總為 0', () => {
    const flows = [
      { day: 0, v: -100 },
      { day: 182, v: -100 },
      { day: 365, v: 230 },
    ];
    const r = xirr(flows)!;
    const npv = flows.reduce((s, f) => s + f.v / Math.pow(1 + r, f.day / 365), 0);
    expect(Math.abs(npv)).toBeLessThan(1e-6);
  });

  it('只有投入、沒有拿回時無法計算', () => {
    expect(xirr([{ day: 0, v: -100 }])).toBeNull();
  });
});

describe('sanitizePlan', () => {
  it('保留正確的設定、丟掉格式不對的階梯', () => {
    const p = sanitizePlan({
      basePrice: 80000,
      baseAmount: 100,
      cadence: 'weekly',
      sellMode: 'once',
      rules: [
        { price: 70000, action: { kind: 'buy', amount: 120 } },
        { price: 80000, action: { kind: 'buy', amount: 1 } }, // 和基準價格一樣：丟掉
        { price: -5, action: { kind: 'buy', amount: 1 } },
        { price: 110000, action: { kind: 'sell', pct: 150 } }, // 超過 100%：丟掉
        { price: 120000, action: { kind: 'sell', pct: 20 } },
      ],
    });
    expect(p?.rules.map((r) => r.price)).toEqual([70000, 120000]);
    expect(p?.sellMode).toBe('once');
  });

  it('壞掉的資料回傳 null', () => {
    expect(sanitizePlan(null)).toBeNull();
    expect(sanitizePlan({ basePrice: 'x', baseAmount: 100 })).toBeNull();
  });
});
