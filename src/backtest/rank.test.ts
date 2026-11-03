import { describe, expect, it } from 'vitest';
import { getAsset } from '../config/assets';
import type { Candle } from '../data/types';
import type { Category, IndicatorDef, Signal } from '../indicators/types';
import type { BacktestConfig } from './engine';
import {
  MIN_TRADES,
  adjacentCheck,
  indexRange,
  runRanking,
  sortRows,
  splitBySample,
  winRateChampion,
  yearlyChampions,
  type Prepared,
  type RankRow,
} from './rank';
import { summarizeAdjacent, summarizeRanking, summarizeYearly } from './rankSummary';

/*
 * 這些測試用「人工產生的波浪價格」與「人工指定的買賣點」驗證排名邏輯（不是真實行情）：
 * - 策略 A：每次都在波谷買、波峰賣 → 每筆都賺
 * - 策略 B：每次都在波峰買、波谷賣 → 每筆都賠
 * - 策略 C：整段資料只交易兩次 → 次數太少，不列入排名
 */

const free: BacktestConfig = { initialCapital: 1000, feeRate: 0, feeDiscount: 1, minFee: 0, sellTaxRate: 0 };

function waveCandles(from: string, n: number): Candle[] {
  const t0 = Date.parse(`${from}T00:00:00Z`);
  const out: Candle[] = [];
  let prev = 100;
  for (let i = 0; i < n; i++) {
    const close = 100 + 10 * Math.sin(i / 5) + i * 0.01;
    out.push({
      time: new Date(t0 + i * 86400000).toISOString().slice(0, 10),
      open: prev,
      high: Math.max(prev, close),
      low: Math.min(prev, close),
      close,
      volume: 1,
    });
    prev = close;
  }
  return out;
}

function extremes(c: Candle[]): { peaks: number[]; troughs: number[] } {
  const peaks: number[] = [];
  const troughs: number[] = [];
  for (let i = 1; i < c.length - 1; i++) {
    if (c[i]!.close > c[i - 1]!.close && c[i]!.close >= c[i + 1]!.close) peaks.push(i);
    if (c[i]!.close < c[i - 1]!.close && c[i]!.close <= c[i + 1]!.close) troughs.push(i);
  }
  return { peaks, troughs };
}

/** 先在 from 買、再到下一個 to 賣 */
function pairSignals(froms: number[], tos: number[]): Signal[] {
  const out: Signal[] = [];
  for (const f of froms) {
    const t = tos.find((x) => x > f);
    if (t === undefined) break;
    out.push({ index: f, side: 'buy', label: '買' }, { index: t, side: 'sell', label: '賣' });
  }
  return out;
}

const fakeDef = (id: string, category: Category) =>
  ({ id, name: id, shortName: id, enName: id, category, placement: 'pane', params: [], defaults: {}, compute: () => ({ lines: [] }) }) as unknown as IndicatorDef;

function prepare(candles: Candle[]): Prepared {
  const { peaks, troughs } = extremes(candles);
  return {
    candles,
    ppy: 365,
    strategies: [
      { def: fakeDef('A', 'trend'), signals: pairSignals(troughs, peaks) },
      { def: fakeDef('B', 'momentum'), signals: pairSignals(peaks, troughs) },
      {
        def: fakeDef('C', 'trend'),
        signals: [
          { index: 10, side: 'buy', label: '買' },
          { index: 20, side: 'sell', label: '賣' },
          { index: 400, side: 'buy', label: '買' },
          { index: 410, side: 'sell', label: '賣' },
        ],
      },
    ],
  };
}

const threeYears = waveCandles('2021-01-01', 1095); // 2021-01-01 ～ 2023-12-31
const prep = prepare(threeYears);
const year2021 = indexRange(threeYears, '2021-01-01', '2021-12-31')!;

describe('indexRange（日期區間 → K 棒位置）', () => {
  it('包含頭尾，超出資料範圍時夾在資料內', () => {
    expect(year2021).toEqual({ start: 0, end: 364 });
    expect(indexRange(threeYears, '2020-06-01', '2021-01-03')).toEqual({ start: 0, end: 2 });
    expect(indexRange(threeYears, '2023-12-30', '2030-01-01')).toEqual({ start: 1093, end: 1094 });
  });
  it('區間裡沒有 K 棒、或起點晚於終點時回傳 null', () => {
    expect(indexRange(threeYears, '2025-01-01', '2025-12-31')).toBeNull();
    expect(indexRange(threeYears, '2022-05-01', '2022-04-01')).toBeNull();
    expect(indexRange([], '2022-01-01', '2022-12-31')).toBeNull();
  });
});

describe('runRanking（同一段期間回測所有策略）', () => {
  const res = runRanking(prep, year2021.start, year2021.end, free);
  const row = (id: string) => res.rows.find((r) => r.def.id === id)!;

  it('每個策略的交易次數、勝率都正確；買進持有對所有策略都一樣', () => {
    expect(row('A').winRate).toBe(1);
    expect(row('A').wins).toBe(row('A').trades);
    expect(row('A').trades).toBeGreaterThanOrEqual(MIN_TRADES);
    expect(row('B').winRate).toBe(0);
    expect(row('C').trades).toBeLessThan(MIN_TRADES);
    expect(res.benchmark.totalReturn).toBeCloseTo(threeYears[364]!.close / threeYears[0]!.open - 1, 10);
  });

  it('交易不到 5 次的另外列出；勝率冠軍只從夠格的策略裡挑', () => {
    const { ranked, lowSample } = splitBySample(res.rows);
    expect(ranked.map((r) => r.def.id)).toEqual(['A', 'B']);
    expect(lowSample.map((r) => r.def.id)).toEqual(['C']);
    expect(winRateChampion(res.rows)?.def.id).toBe('A');
  });
});

describe('sortRows（排序與同分時的順序）', () => {
  const r = (id: string, winRate: number | null, trades: number, totalReturn: number, maxDrawdown: number): RankRow => ({
    def: fakeDef(id, 'trend'),
    trades,
    wins: Math.round((winRate ?? 0) * trades),
    winRate,
    totalReturn,
    maxDrawdown,
    avgReturn: null,
    exposure: 0.5,
    holding: false,
  });
  const rows = [r('a', 0.6, 5, 0.1, 0.2), r('b', 0.6, 10, 0.05, 0.1), r('c', 0.8, 6, -0.1, 0.3), r('d', null, 0, 0, 0)];

  it('勝率相同時，交易次數多的在前；沒有交易的排最後', () => {
    expect(sortRows(rows, 'winRate').map((x) => x.def.id)).toEqual(['c', 'b', 'a', 'd']);
  });
  it('總報酬、回撤最小、交易次數', () => {
    expect(sortRows(rows, 'return').map((x) => x.def.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(sortRows(rows, 'drawdown').map((x) => x.def.id)).toEqual(['d', 'b', 'a', 'c']);
    expect(sortRows(rows, 'trades').map((x) => x.def.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('冠軍換到另一段期間還有效嗎', () => {
  it('後面還有資料時，看「下一段同樣長度」的期間', () => {
    const chk = adjacentCheck(prep, year2021.start, year2021.end, free)!;
    expect(chk.direction).toBe('next');
    expect(chk.champion.def.id).toBe('A');
    expect(chk.other.start).toBe(year2021.end + 1);
    expect(chk.otherRank).toBe(1);
    expect(summarizeAdjacent(chk, threeYears).join('')).toContain('接下來同樣長度的期間');
  });

  it('選到最新的資料時，改看「上一段期間的冠軍」到這段期間的表現', () => {
    const last = threeYears.length - 1;
    const chk = adjacentCheck(prep, last - 199, last, free)!;
    expect(chk.direction).toBe('prev');
    expect(chk.base.end).toBe(last - 200);
    expect(chk.other.start).toBe(last - 199);
  });

  it('期間前後都沒有足夠的資料時回傳 null', () => {
    const short = prepare(waveCandles('2021-01-01', 80));
    expect(adjacentCheck(short, 0, 79, free)).toBeNull();
  });
});

describe('每年的勝率冠軍，隔年表現如何', () => {
  it('完整的年度才當作冠軍年；隔年還沒過完時標示出來', () => {
    const full = yearlyChampions(prep, free);
    expect(full.map((y) => [y.year, y.nextYear, y.nextPartial])).toEqual([
      [2021, 2022, false],
      [2022, 2023, false],
    ]);
    expect(full.every((y) => y.champion.def.id === 'A' && y.nextRank === 1)).toBe(true);
    expect(summarizeYearly(full).join('')).toContain('平均排第 1.0 名');

    const partial = yearlyChampions(prepare(waveCandles('2021-01-01', 912)), free); // 到 2023-07-01
    expect(partial.at(-1)).toMatchObject({ year: 2022, nextYear: 2023, nextPartial: true });
  });

  it('資料從年中開始的那一年不算', () => {
    const midYear = prepare(waveCandles('2021-06-15', 900));
    expect(yearlyChampions(midYear, free)[0]?.year).toBe(2022);
  });
});

describe('summarizeRanking（白話結論）', () => {
  const btc = getAsset('BTC')!;
  it('寫出勝率冠軍、贏過買進持有的數量，以及次數太少的提醒', () => {
    const text = summarizeRanking(runRanking(prep, year2021.start, year2021.end, free), threeYears, btc).join('\n');
    expect(text).toContain('勝率最高的是「A」');
    expect(text).toContain('勝率 100%');
    expect(text).toContain('3 個策略裡');
    expect(text).toContain('交易不到 5 次');
  });
  it('期間太短、沒有策略夠格時，直接說明排名沒有參考價值', () => {
    const text = summarizeRanking(runRanking(prep, 0, 19, free), threeYears, btc).join('\n');
    expect(text).toContain('勝率排名沒有參考價值');
  });
});
