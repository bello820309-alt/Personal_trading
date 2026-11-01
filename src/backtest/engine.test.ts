import { describe, expect, it } from 'vitest';
import type { Candle } from '../data/types';
import type { Signal } from '../indicators/types';
import { buyAll, runBacktest, sellAll, type BacktestConfig } from './engine';
import { equityMetrics, periodsPerYear } from './metrics';
import { periodStartIndex } from './strategies';

const free: BacktestConfig = { initialCapital: 1000, feeRate: 0, feeDiscount: 1, minFee: 0, sellTaxRate: 0 };
const tw: BacktestConfig = { initialCapital: 100_000, feeRate: 0.001425, feeDiscount: 1, minFee: 20, sellTaxRate: 0.001 };

/** 手工 K 棒：每根的開盤與收盤可以分別指定 */
function bars(rows: [number, number][]): Candle[] {
  return rows.map(([open, close], i) => ({
    time: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 1,
  }));
}

const buy = (index: number): Signal => ({ index, side: 'buy', label: '買' });
const sell = (index: number): Signal => ({ index, side: 'sell', label: '賣' });

describe('回測引擎', () => {
  const c = bars([
    [10, 10],
    [10, 11],
    [12, 12],
    [13, 14],
    [15, 16],
    [16, 15],
  ]);

  it('訊號隔天開盤成交（不偷看未來）', () => {
    const r = runBacktest(c, [buy(1), sell(3)], 0, 5, free, 252);
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0]!;
    expect(t.entryIndex).toBe(2); // 第 1 根收盤出現訊號 → 第 2 根開盤 12 買進
    expect(t.entryPrice).toBe(12);
    expect(t.exitIndex).toBe(4); // 第 3 根收盤出現賣出訊號 → 第 4 根開盤 15 賣出
    expect(t.exitPrice).toBe(15);
    expect(t.returnPct).toBeCloseTo(15 / 12 - 1, 12);
    expect(r.metrics.finalValue).toBeCloseTo(1000 * (15 / 12), 9);
    // 訊號出現之前與賣出之後都是現金
    expect(r.equity[1]!.value).toBe(1000);
    expect(r.equity[5]!.value).toBeCloseTo(1250, 9);
  });

  it('持有中的重複買進訊號、空手時的賣出訊號都會被忽略', () => {
    const r = runBacktest(c, [sell(0), buy(1), buy(2), buy(3)], 0, 5, free, 252);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]!.open).toBe(true);
    expect(r.trades[0]!.entryIndex).toBe(2);
  });

  it('期末仍持有時以最後收盤價計算市值', () => {
    const r = runBacktest(c, [buy(1)], 0, 5, free, 252);
    const t = r.trades[0]!;
    expect(t.open).toBe(true);
    expect(t.proceeds).toBeCloseTo((1000 / 12) * 15, 9);
    expect(r.stats.closedCount).toBe(0);
    expect(r.stats.winRate).toBeNull();
  });

  it('最後一根的訊號沒有隔天可以成交，所以不執行', () => {
    const r = runBacktest(c, [buy(5)], 0, 5, free, 252);
    expect(r.trades).toHaveLength(0);
  });

  it('回測期間開始之前的訊號不算', () => {
    const r = runBacktest(c, [buy(0), sell(4)], 2, 5, free, 252);
    expect(r.trades).toHaveLength(0);
    expect(r.equity[0]!.time).toBe(c[2]!.time);
  });

  it('買進持有：第一天開盤買進抱到最後', () => {
    const r = runBacktest(c, [], 0, 5, free, 252);
    expect(r.benchmark[5]!.value).toBeCloseTo((1000 / 10) * 15, 9);
  });

  it('台股成本：手續費 0.1425%（最低 20 元）、賣出加收 0.1% 交易稅', () => {
    const b = buyAll(100_000, 50, tw);
    // 金額 + 手續費 = 100,000 → 金額 = 100,000 ÷ 1.001425
    const notional = 100_000 / 1.001425;
    expect(b.fee).toBeCloseTo(notional * 0.001425, 9);
    expect(b.shares).toBeCloseTo(notional / 50, 9);
    const s = sellAll(b.shares, 55, tw);
    const gross = b.shares * 55;
    expect(s.fee).toBeCloseTo(gross * 0.001425, 9);
    expect(s.tax).toBeCloseTo(gross * 0.001, 9);
    expect(s.cash).toBeCloseTo(gross * (1 - 0.001425 - 0.001), 9);
  });

  it('金額小時套用最低手續費', () => {
    const small: BacktestConfig = { ...tw, initialCapital: 5000 };
    const b = buyAll(5000, 50, small);
    expect(b.fee).toBe(20); // 5000 × 0.1425% ≈ 7.1 元，低於 20 元
    expect(b.shares).toBeCloseTo(4980 / 50, 9);
    const s = sellAll(b.shares, 50, small);
    expect(s.fee).toBe(20);
  });

  it('手續費折扣', () => {
    const b = buyAll(100_000, 50, { ...tw, feeDiscount: 0.6 });
    expect(b.fee).toBeCloseTo((100_000 / (1 + 0.001425 * 0.6)) * 0.001425 * 0.6, 9);
  });
});

describe('績效指標', () => {
  it('最大回撤：從最高點到之後的最低點', () => {
    const m = equityMetrics(
      [100, 120, 90, 130, 65, 80].map((value, i) => ({ time: `2024-01-0${i + 1}`, value })),
      252,
    );
    expect(m.maxDrawdown).toBeCloseTo(0.5, 12);
    expect(m.maxDrawdownPeak).toBe('2024-01-04');
    expect(m.maxDrawdownTrough).toBe('2024-01-05');
    expect(m.totalReturn).toBeCloseTo(-0.2, 12);
  });

  it('年化報酬：兩年翻倍約 41.4%', () => {
    const m = equityMetrics(
      [
        { time: '2020-01-01', value: 100 },
        { time: '2021-12-31', value: 200 },
      ],
      252,
    );
    expect(m.years).toBeCloseTo(2, 2);
    expect(m.cagr).toBeCloseTo(Math.SQRT2 - 1, 2);
  });

  it('期間太短不計算年化報酬', () => {
    const m = equityMetrics(
      [
        { time: '2024-01-01', value: 100 },
        { time: '2024-02-01', value: 110 },
      ],
      252,
    );
    expect(m.cagr).toBeNull();
  });

  it('一年大約幾根 K 棒由資料估計', () => {
    const times = Array.from({ length: 366 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10));
    expect(periodsPerYear(times)).toBeCloseTo(365.25, 0);
  });

  it('回測期間的起點', () => {
    const c = bars(Array.from({ length: 800 }, () => [10, 10] as [number, number]));
    const start = periodStartIndex(c, 799, '1Y');
    expect(c[start]!.time >= '2025-03-10').toBe(true);
    expect(799 - start).toBeGreaterThan(360);
    expect(periodStartIndex(c, 799, 'ALL')).toBe(0);
  });
});
