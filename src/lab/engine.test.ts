import { describe, expect, it } from 'vitest';
import type { Candle } from '../data/types';
import {
  agentAssets,
  availableCash,
  benchmarkOrders,
  dayNumber,
  equitySeries,
  fillPoint,
  marketAt,
  pendingOrders,
  phaseOf,
  settleOrders,
  specialtyOf,
  standing,
  stateFrom,
  type LabMarket,
} from './engine';
import { localTime, shortDay, zonedTime } from './time';
import type { LabExperiment, LabOrder } from './types';

/* 手工組的行情（不是真實價格），用來檢查成交時間、價格、手續費、匯率的規則 */

function candles(rows: [string, number, number][]): Candle[] {
  return rows.map(([time, open, close]) => ({ time, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1 }));
}

const market: LabMarket = {
  candles: {
    // 台股：11/7、11/8 是週末
    '0050': candles([
      ['2026-11-04', 100, 101],
      ['2026-11-05', 102, 103],
      ['2026-11-06', 104, 105],
      ['2026-11-09', 106, 107],
    ]),
    // 美股（紐約日期）
    VOO: candles([
      ['2026-11-03', 690, 692],
      ['2026-11-04', 694, 696],
      ['2026-11-05', 698, 700],
      ['2026-11-06', 702, 704],
      ['2026-11-09', 706, 708],
    ]),
    // 比特幣（UTC 日期），每天都有
    BTC: candles([
      ['2026-11-03', 76000, 77000],
      ['2026-11-04', 77000, 78000],
      ['2026-11-05', 78000, 80000],
      ['2026-11-06', 80000, 79000],
      ['2026-11-07', 79000, 81000],
    ]),
  },
  fx: { t: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], c: [32.0, 32.1, 32.2, 32.3, 32.4] },
};

/** 台灣時間 → ISO */
const tpe = (date: string, hm: string) => new Date(zonedTime(date, hm, 'Asia/Taipei')).toISOString();

let seq = 0;
function order(o: Partial<LabOrder> & Pick<LabOrder, 'asset' | 'side'>): LabOrder {
  seq++;
  return { id: `t-${seq}`, placedAt: tpe('2026-11-04', '15:43'), day: '2026-11-04', reason: '測試', ...o };
}

describe('時區工具', () => {
  it('台灣時間和 UTC、紐約時間互換（含美國冬令時間）', () => {
    expect(tpe('2026-11-04', '15:43')).toBe('2026-11-04T07:43:00.000Z');
    expect(localTime(Date.parse('2026-11-04T07:43:00Z'), 'America/New_York')).toEqual({ date: '2026-11-04', hm: '02:43' });
    // 美國 11/1 結束夏令時間：開盤 9:30 = UTC 14:30；夏天是 13:30
    expect(new Date(zonedTime('2026-11-04', '09:30', 'America/New_York')).toISOString()).toBe('2026-11-04T14:30:00.000Z');
    expect(new Date(zonedTime('2026-10-30', '09:30', 'America/New_York')).toISOString()).toBe('2026-10-30T13:30:00.000Z');
    expect(shortDay('2026-11-04')).toBe('11/4（三）');
  });
});

describe('fillPoint：什麼時候、什麼價格成交', () => {
  it('0050：下午下單 → 隔天開盤價；早上開盤前下單 → 當天開盤價', () => {
    const p = fillPoint({ asset: '0050', placedAt: tpe('2026-11-04', '15:43') }, market)!;
    expect(p.date).toBe('2026-11-05');
    expect(p.price).toBe(102);
    expect(new Date(p.at).toISOString()).toBe('2026-11-05T01:00:00.000Z');
    expect(fillPoint({ asset: '0050', placedAt: tpe('2026-11-05', '08:30') }, market)!.price).toBe(102);
  });

  it('0050：週五下午下單 → 下週一開盤', () => {
    expect(fillPoint({ asset: '0050', placedAt: tpe('2026-11-06', '15:43') }, market)!.date).toBe('2026-11-09');
  });

  it('VOO：台灣下午下單 → 當天晚上美股開盤價', () => {
    const p = fillPoint({ asset: 'VOO', placedAt: tpe('2026-11-04', '15:43') }, market)!;
    expect(p.date).toBe('2026-11-04');
    expect(p.price).toBe(694);
    expect(new Date(p.at).toISOString()).toBe('2026-11-04T14:30:00.000Z');
  });

  it('比特幣：用下單那天（UTC）日 K 的收盤價，成交時間是隔天台灣早上 8 點', () => {
    const p = fillPoint({ asset: 'BTC', placedAt: tpe('2026-11-04', '15:43') }, market)!;
    expect(p.date).toBe('2026-11-04');
    expect(p.price).toBe(78000);
    expect(new Date(p.at).toISOString()).toBe('2026-11-05T00:00:00.000Z');
    // 台灣早上 7 點 = UTC 前一天 23:00
    expect(fillPoint({ asset: 'BTC', placedAt: tpe('2026-11-05', '07:00') }, market)!.price).toBe(78000);
  });

  it('資料裡還沒有那根 K 棒 → 還不能成交', () => {
    expect(fillPoint({ asset: '0050', placedAt: tpe('2026-11-09', '15:43') }, market)).toBeNull();
    expect(fillPoint({ asset: 'BTC', placedAt: tpe('2026-11-08', '15:43') }, market)).toBeNull();
  });
});

describe('settleOrders：成交金額、手續費、稅、匯率', () => {
  const now = '2026-11-10T00:00:00.000Z';

  it('0050 買進：整數股、手續費 0.1425% 無條件捨去、最低 20 元', () => {
    const o = order({ asset: '0050', side: 'buy', amount: 100000 });
    const [f] = settleOrders([o], [], market, 1_000_000, now);
    // 100000 / (102 × 1.001425) = 978.9… → 978 股；手續費 floor(99756 × 0.001425) = 142
    expect(f).toMatchObject({ status: 'filled', date: '2026-11-05', price: 102, units: 978, value: 99756, fee: 142, tax: 0, cash: -99898 });
    expect(f!.fx).toBeUndefined();
  });

  it('金額很小時最低手續費 20 元也算進去', () => {
    const o = order({ asset: '0050', side: 'buy', amount: 2050 });
    const [f] = settleOrders([o], [], market, 1_000_000, now);
    // 20 股 = 2040 + 20 = 2060 > 2050 → 19 股 = 1938 + 20
    expect(f).toMatchObject({ units: 19, value: 1938, fee: 20, cash: -1958 });
  });

  it('VOO：用成交日前一天的匯率換成美元，可以買到小數第 4 位', () => {
    const o = order({ asset: 'VOO', side: 'buy', amount: 100000 });
    const [f] = settleOrders([o], [], market, 1_000_000, now);
    // 成交 11/4（UTC 14:30）→ 用 11/3 的匯率 32.1；100000 / 32.1 / 694 = 4.48885… → 4.4888 股
    expect(f).toMatchObject({ price: 694, fx: 32.1, fxDate: '2026-11-03', units: 4.4888, fee: 0 });
    expect(f!.value).toBeCloseTo(4.4888 * 694 * 32.1, 2);
  });

  it('比特幣：手續費 0.1%，成交在隔天 UTC 00:00 → 用前一天（11/4）的匯率', () => {
    const o = order({ asset: 'BTC', side: 'buy', amount: 100000 });
    const [f] = settleOrders([o], [], market, 1_000_000, now);
    expect(f).toMatchObject({ price: 78000, fx: 32.2, fxDate: '2026-11-04' });
    const units = Math.floor((100000 / 32.2 / (78000 * 1.001)) * 1e8) / 1e8;
    expect(f!.units).toBe(units);
    expect(f!.cash).toBeCloseTo(-100000, 0);
    expect(f!.cash! >= -100000).toBe(true);
  });

  it('0050 賣出：依持有比例、整數股，扣手續費和 0.1% 交易稅', () => {
    const buy = order({ asset: '0050', side: 'buy', amount: 100000 });
    const sell = order({ asset: '0050', side: 'sell', pct: 50, placedAt: tpe('2026-11-05', '15:43'), day: '2026-11-05' });
    const fills = settleOrders([buy, sell], [], market, 1_000_000, now);
    expect(fills).toHaveLength(2);
    const s = fills[1]!;
    // 持有 978 股的 50% = 489 股 × 104（11/6 開盤）= 50856；手續費 floor(72.47) = 72；稅 floor(50.856) = 50
    expect(s).toMatchObject({ side: 'sell', date: '2026-11-06', units: 489, value: 50856, fee: 72, tax: 50, cash: 50734 });
    const st = stateFrom(1_000_000, fills);
    expect(st.holdings['0050']!.units).toBe(489);
    expect(st.cash).toBe(1_000_000 - 99898 + 50734);
    // 已實現損益 = 拿回 50734 − 一半的成本 49949
    expect(st.realized).toBe(50734 - 99898 / 2);
  });

  it('賣 100% 會全部賣光；沒有持股的賣單不會成交', () => {
    const buy = order({ asset: 'BTC', side: 'buy', amount: 50000 });
    const sellAll = order({ asset: 'BTC', side: 'sell', pct: 100, placedAt: tpe('2026-11-05', '15:43'), day: '2026-11-05' });
    const sellAgain = order({ asset: 'BTC', side: 'sell', pct: 50, placedAt: tpe('2026-11-06', '15:43'), day: '2026-11-06' });
    const fills = settleOrders([buy, sellAll, sellAgain], [], market, 1_000_000, now);
    expect(fills.map((f) => f.status)).toEqual(['filled', 'filled', 'rejected']);
    expect(fills[1]!.units).toBe(fills[0]!.units);
    expect(fills[2]!.note).toContain('沒有持股');
    expect(stateFrom(1_000_000, fills).holdings.BTC).toBeUndefined();
  });

  it('已經算過的不會重算；取消的單不會成交；資料還沒到的留著下次算', () => {
    const a = order({ asset: '0050', side: 'buy', amount: 10000 });
    const b = order({ asset: '0050', side: 'buy', amount: 10000, cancelledAt: '2026-11-04T08:00:00.000Z' });
    const c = order({ asset: '0050', side: 'buy', amount: 10000, placedAt: tpe('2026-11-09', '15:43'), day: '2026-11-09' });
    const first = settleOrders([a, b, c], [], market, 1_000_000, now);
    expect(first.map((f) => f.orderId)).toEqual([a.id]);
    expect(settleOrders([a, b, c], first, market, 1_000_000, now)).toEqual([]);
    expect(pendingOrders([a, b, c], first).map((o) => o.id)).toEqual([c.id]);
  });

  it('還沒有需要的匯率就先不成交', () => {
    const o = order({ asset: 'VOO', side: 'buy', amount: 10000 });
    expect(settleOrders([o], [], { ...market, fx: null }, 1_000_000, now)).toEqual([]);
  });

  it('可用現金要扣掉還沒成交的買單', () => {
    const done = order({ asset: '0050', side: 'buy', amount: 100000 });
    const fills = settleOrders([done], [], market, 1_000_000, now);
    const waiting = order({ asset: '0050', side: 'buy', amount: 200000, placedAt: tpe('2026-11-09', '15:43') });
    expect(availableCash(1_000_000, [done, waiting], fills)).toBe(1_000_000 - 99898 - 200000);
  });
});

describe('總資產與對照組', () => {
  const exp: LabExperiment = {
    schemaVersion: 1,
    title: '測試',
    capital: 900_000,
    start: '2026-11-04',
    end: '2026-11-06',
    wrapUp: '2026-11-07',
    runTime: '15:43',
    assets: ['0050', 'VOO', 'BTC'],
    agents: [],
    benchmark: { name: '買了不動', intro: '第一天平均買進', weights: { '0050': 1 / 3, VOO: 1 / 3, BTC: 1 / 3 } },
  };

  it('對照組第一天平均買進三檔，用一樣的成交規則', () => {
    const orders = benchmarkOrders(exp);
    expect(orders.map((o) => [o.asset, o.amount, o.placedAt])).toEqual([
      ['0050', 300000, '2026-11-04T07:43:00.000Z'],
      ['VOO', 300000, '2026-11-04T07:43:00.000Z'],
      ['BTC', 300000, '2026-11-04T07:43:00.000Z'],
    ]);
    const fills = settleOrders(orders, [], market, exp.capital, '2026-11-10T00:00:00.000Z');
    expect(fills.every((f) => f.status === 'filled')).toBe(true);
  });

  it('每天的總資產：還沒成交前是本金，之後用每天的收盤價和匯率估算', () => {
    const fills = settleOrders(benchmarkOrders(exp), [], market, exp.capital, '2026-11-10T00:00:00.000Z');
    const eq = equitySeries(exp.capital, fills, market, '2026-11-03', '2026-11-07');
    expect(eq.map((p) => p.time)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(eq[0]!.value).toBe(900_000);
    // 11/5：三檔都已成交；0050 收 103、VOO 收 700、BTC 收 80000，匯率 32.3
    const st = stateFrom(exp.capital, fills);
    const h = st.holdings;
    const expected = st.cash + h['0050']!.units * 103 + h.VOO!.units * 700 * 32.3 + h.BTC!.units * 80000 * 32.3;
    expect(eq[2]!.value).toBeCloseTo(expected, 4);
    // 11/7（週六）：股票用週五收盤、比特幣用 11/7、匯率用 11/6
    const sat = st.cash + h['0050']!.units * 105 + h.VOO!.units * 704 * 32.4 + h.BTC!.units * 81000 * 32.4;
    expect(eq[4]!.value).toBeCloseTo(sat, 4);
    const now = standing(exp.capital, fills, market, '2026-11-07');
    expect(now.value).toBeCloseTo(sat, 4);
    expect(now.returnPct).toBeCloseTo(sat / 900_000 - 1, 8);
    expect(now.valuation.holdings.map((x) => x.asset.id).sort()).toEqual(['0050', 'BTC', 'VOO']);
  });

  it('第幾天、實驗階段', () => {
    expect(dayNumber(exp, '2026-11-03')).toBe(0);
    expect(dayNumber(exp, '2026-11-04')).toBe(1);
    expect(dayNumber(exp, '2026-11-06')).toBe(3);
    expect(phaseOf(exp, '2026-11-03')).toBe('before');
    expect(phaseOf(exp, '2026-11-06')).toBe('running');
    expect(phaseOf(exp, '2026-11-07')).toBe('wrapup');
    expect(phaseOf(exp, '2026-11-08')).toBe('done');
  });
});

describe('marketAt：只用當下已經知道的資料', () => {
  it('還沒收盤的 K 棒、還沒過完那天的匯率都拿掉', () => {
    // 台灣 11/5 15:43 = UTC 07:43：0050 的 11/5 已收盤；VOO 的 11/5（紐約）還沒開盤；比特幣 11/5（UTC）還沒收盤
    const m = marketAt(market, Date.parse(tpe('2026-11-05', '15:43')));
    expect(m.candles['0050']!.at(-1)!.time).toBe('2026-11-05');
    expect(m.candles.VOO!.at(-1)!.time).toBe('2026-11-04');
    expect(m.candles.BTC!.at(-1)!.time).toBe('2026-11-04');
    expect(m.fx!.t.at(-1)).toBe('2026-11-04');
    // 台灣 11/5 13:00：0050 的 11/5 還沒收盤
    expect(marketAt(market, Date.parse(tpe('2026-11-05', '13:00'))).candles['0050']!.at(-1)!.time).toBe('2026-11-04');
  });

  it('資料本來就只有過去時，什麼都不會少', () => {
    const m = marketAt(market, Date.parse('2026-12-01T00:00:00Z'));
    expect(m.candles['0050']).toBe(market.candles['0050']);
    expect(m.fx).toBe(market.fx);
  });
});

describe('分批買進的對照組、專攻一檔的參加者', () => {
  const exp: LabExperiment = {
    schemaVersion: 1,
    title: '測試',
    capital: 1_000_000,
    start: '2026-11-04',
    end: '2026-12-03',
    wrapUp: '2026-12-04',
    runTime: '15:43',
    assets: ['0050', 'VOO', 'BTC'],
    agents: [
      { id: 'a', name: '新手 A', intro: '' },
      { id: 'c', name: '0050 專攻', intro: '', assets: ['0050'] },
    ],
    benchmark: { name: '買了不動', intro: '分 4 週買進', weights: { '0050': 1 / 3, VOO: 1 / 3, BTC: 1 / 3 }, tranches: 4, everyDays: 7 },
  };

  it('分 4 週、每週一次，每次買本金的 1/4（三檔各 1/3）', () => {
    const orders = benchmarkOrders(exp);
    expect(orders).toHaveLength(12);
    expect([...new Set(orders.map((o) => o.day))]).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']);
    expect(orders.filter((o) => o.day === '2026-11-11').map((o) => [o.asset, o.amount, o.placedAt])).toEqual([
      ['0050', 83333, '2026-11-11T07:43:00.000Z'],
      ['VOO', 83333, '2026-11-11T07:43:00.000Z'],
      ['BTC', 83333, '2026-11-11T07:43:00.000Z'],
    ]);
    expect(new Set(orders.map((o) => o.id)).size).toBe(12);
  });

  it('只買一檔的對照：每週 25 萬', () => {
    const orders = benchmarkOrders(exp, { '0050': 1 });
    expect(orders.map((o) => o.amount)).toEqual([250000, 250000, 250000, 250000]);
    expect(orders.every((o) => o.asset === '0050')).toBe(true);
  });

  it('沒有設定分批時，第一天一次買完', () => {
    const once = { ...exp, benchmark: { ...exp.benchmark, tranches: undefined } };
    expect(benchmarkOrders(once).map((o) => o.amount)).toEqual([333333, 333333, 333333]);
  });

  it('參加者可以買賣的標的', () => {
    expect(agentAssets(exp, 'a')).toEqual(['0050', 'VOO', 'BTC']);
    expect(agentAssets(exp, 'c')).toEqual(['0050']);
    expect(specialtyOf(exp, 'a')).toBeNull();
    expect(specialtyOf(exp, 'c')).toBe('0050');
  });
});
