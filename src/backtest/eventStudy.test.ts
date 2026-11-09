import { describe, expect, it } from 'vitest';
import type { Candle } from '../data/types';
import type { MarketEvent } from '../data/events';
import type { Category, IndicatorDef } from '../indicators/types';
import type { BacktestConfig } from './engine';
import { barAtOrBefore, baselineStats, eventRows, groupStats, rankByRegime, regimeShares, windowReturns, windowStats } from './eventStudy';
import type { Prepared } from './rank';

/* 這些測試用人工產生的 K 棒（不是真實行情）驗證計算方式 */

const free: BacktestConfig = { initialCapital: 1000, feeRate: 0, feeDiscount: 1, minFee: 0, sellTaxRate: 0 };

/** 每天收盤價 = 100 + 第幾天（方便手算報酬） */
function linear(from: string, n: number, skipWeekends = false): Candle[] {
  const out: Candle[] = [];
  const t0 = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const d = new Date(t0 + i * 86400000);
    if (skipWeekends && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) continue;
    const close = 100 + i;
    out.push({ time: d.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1 });
  }
  return out;
}

const ev = (date: string): MarketEvent => ({ date, group: 'hike', title: 'test' });

describe('事件前後的漲跌', () => {
  const c = linear('2024-01-01', 100); // 第 i 天收盤 = 100 + i

  it('都從事件前一天的收盤算起', () => {
    // 事件日 2024-01-20（第 19 天）→ 基準是第 18 天收盤 118
    const r = windowReturns(c, '2024-01-20')!;
    expect(r.before7).toBeCloseTo(118 / 111 - 1, 12); // 第 11 天 → 第 18 天
    expect(r.after1).toBeCloseTo(120 / 118 - 1, 12); // 第 20 天
    expect(r.after7).toBeCloseTo(126 / 118 - 1, 12);
    expect(r.after30).toBeCloseTo(149 / 118 - 1, 12);
  });

  it('資料還沒到的部分是 null', () => {
    const r = windowReturns(c, '2024-04-05')!; // 最後一天是 2024-04-09
    expect(r.after1).not.toBeNull();
    expect(r.after7).toBeNull();
    expect(r.after30).toBeNull();
  });

  it('股票遇到週末休市，用之前最近的一根 K 棒', () => {
    const s = linear('2024-01-01', 60, true); // 2024-01-06、07 是週末
    expect(s[barAtOrBefore(s, '2024-01-07')]!.time).toBe('2024-01-05');
    const r = windowReturns(s, '2024-01-08')!; // 週一的事件：基準是週五（第 4 天，104）
    expect(r.after1).toBeCloseTo(108 / 104 - 1, 12); // 週二是第 8 天
  });

  it('只列出資料範圍內的事件', () => {
    const rows = eventRows(c, [ev('2023-12-01'), ev('2024-01-20'), ev('2024-02-10'), ev('2025-01-01')]);
    expect(rows.map((r) => r.event.date)).toEqual(['2024-01-20', '2024-02-10']);
    expect(groupStats(rows).after7.n).toBe(2);
  });
});

describe('統計：平均、中位數、上漲比例', () => {
  it('忽略還沒有資料的事件', () => {
    expect(windowStats([0.1, -0.2, 0.3, null])).toEqual({ n: 3, avg: expect.closeTo(0.0667, 3), median: 0.1, upRatio: 2 / 3 });
    expect(windowStats([0.1, 0.3])).toMatchObject({ median: expect.closeTo(0.2, 12) });
    expect(windowStats([null])).toEqual({ n: 0, avg: null, median: null, upRatio: null });
  });
  it('對照組把每一天都當成事件日；一路上漲時每天都是「上漲」', () => {
    const b = baselineStats(linear('2024-01-01', 100));
    expect(b.after7.upRatio).toBe(1);
    expect(b.after7.n).toBeGreaterThan(50);
  });
});

describe('利率環境', () => {
  const fake = (id: string, category: Category) =>
    ({ id, name: id, shortName: id, enName: id, category, placement: 'pane', params: [], defaults: {}, compute: () => ({ lines: [] }) }) as unknown as IndicatorDef;

  it('每筆交易依買進那天的利率環境歸類', () => {
    // 2022-01-01 起 400 天：2022-03-16 開始升息
    const c = linear('2022-01-01', 400);
    const prep: Prepared = {
      candles: c,
      ppy: 365,
      strategies: [
        {
          def: fake('A', 'trend'),
          signals: [
            { index: 10, side: 'buy', label: '買' }, // 2022-01-11 → 利率不變期（上次調整是 2020 年）
            { index: 20, side: 'sell', label: '賣' },
            { index: 100, side: 'buy', label: '買' }, // 2022-04-11 → 升息期
            { index: 110, side: 'sell', label: '賣' },
          ],
        },
      ],
    };
    const res = rankByRegime(prep, free);
    const get = (r: string) => res.find((x) => x.regime === r)!;
    expect(get('steady').rows[0]).toMatchObject({ trades: 1, wins: 1 });
    expect(get('hiking').rows[0]).toMatchObject({ trades: 1, wins: 1 });
    expect(get('cutting').rows).toEqual([]);
    expect(get('hiking').share + get('steady').share + get('cutting').share).toBeCloseTo(1, 10);
  });

  it('一段期間裡各種環境的比例', () => {
    const c = linear('2022-01-01', 365);
    const s = regimeShares(c, 0, 364);
    expect(s.steady + s.hiking + s.cutting).toBeCloseTo(1, 10);
    expect(s.hiking).toBeGreaterThan(0.7); // 2022-03-16 之後都是升息期
  });
});

describe('還沒滿期間的事件：寫出到目前為止的漲跌', () => {
  it('事件後 7 天還沒到時，記下從事件前一天收盤到最新收盤的漲跌', () => {
    const bars: Candle[] = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((time, i) => ({
      time,
      open: 100,
      high: 100,
      low: 100,
      close: [100, 100, 99, 98, 97.8][i]!,
      volume: 1,
    }));
    const ev: MarketEvent = { date: '2026-11-03', group: 'election', title: '美國期中選舉（投票日）' };
    const [row] = eventRows(bars, [ev]);
    expect(row!.returns.after1).toBeCloseTo(-0.01, 10);
    expect(row!.returns.after7).toBeNull();
    expect(row!.sofar!.date).toBe('2026-11-06');
    expect(row!.sofar!.ret).toBeCloseTo(-0.022, 10);
  });
});
