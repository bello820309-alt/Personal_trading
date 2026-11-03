import type { AssetConfig } from '../config/assets';
import { completedLength } from '../data/parse';
import { indexRange } from '../data/range';
import { adjustCandles } from '../data/resample';
import type { AssetSeries, Candle } from '../data/types';
import { computeIndicator, signalsOf, STRATEGY_INDICATORS } from '../indicators/registry';
import type { IndicatorDef, Signal } from '../indicators/types';
import { runBacktest, type BacktestConfig } from './engine';
import { periodsPerYear, type EquityMetrics } from './metrics';

/*
 * 策略排行榜：同一段期間，把每個指標的經典規則都回測一次，再依勝率等條件排名。
 * 指標與訊號只用全部歷史資料算一次（暖身期充足），不同期間共用，所以切換期間很快。
 */

/** 完成的交易少於這個數字，勝率的運氣成分太大，不列入排名 */
export const MIN_TRADES = 5;

export interface PreparedStrategy {
  def: IndicatorDef;
  signals: Signal[];
}

export interface Prepared {
  /** 還原權息後、已收盤的日 K */
  candles: Candle[];
  ppy: number;
  strategies: PreparedStrategy[];
}

export function prepareStrategies(series: AssetSeries, asset: AssetConfig, defs: IndicatorDef[] = STRATEGY_INDICATORS): Prepared {
  const n = completedLength(series);
  const candles = adjustCandles(series.candles, series.adjClose).slice(0, n);
  const strategies = defs.map((def) => {
    const ci = computeIndicator(def, candles, asset.market, null);
    return { def, signals: signalsOf(ci, candles) };
  });
  return { candles, ppy: periodsPerYear(candles.map((c) => c.time)), strategies };
}

export { indexRange };

export interface RankRow {
  def: IndicatorDef;
  /** 完成（買進後又賣出）的交易筆數 */
  trades: number;
  wins: number;
  winRate: number | null;
  totalReturn: number;
  maxDrawdown: number;
  avgReturn: number | null;
  /** 有持股的時間比例 */
  exposure: number;
  /** 期末仍持有中（這筆不算進勝率） */
  holding: boolean;
}

export interface RankResult {
  start: number;
  end: number;
  /** 買進持有（同一段期間） */
  benchmark: EquityMetrics;
  /** 依註冊順序，未排序 */
  rows: RankRow[];
}

export function runRanking(prep: Prepared, start: number, end: number, cfg: BacktestConfig): RankResult {
  let benchmark: EquityMetrics | null = null;
  const rows = prep.strategies.map(({ def, signals }) => {
    const r = runBacktest(prep.candles, signals, start, end, cfg, prep.ppy);
    benchmark ??= r.benchmarkMetrics;
    const closed = r.trades.filter((t) => !t.open);
    return {
      def,
      trades: closed.length,
      wins: closed.filter((t) => t.returnPct > 0).length,
      winRate: r.stats.winRate,
      totalReturn: r.metrics.totalReturn,
      maxDrawdown: r.metrics.maxDrawdown,
      avgReturn: r.stats.avgReturn,
      exposure: r.stats.exposure,
      holding: r.trades.some((t) => t.open),
    };
  });
  if (!benchmark) throw new Error('沒有任何策略可以排名');
  return { start, end, benchmark, rows };
}

export type RankSort = 'winRate' | 'return' | 'drawdown' | 'trades';

export const RANK_SORT_LABELS: Record<RankSort, string> = {
  winRate: '勝率',
  return: '總報酬',
  drawdown: '回撤最小',
  trades: '交易次數',
};

/** 排序：勝率相同時，交易次數多的在前（證據比較多），再比總報酬 */
export function sortRows(rows: readonly RankRow[], sort: RankSort): RankRow[] {
  const byReturn = (a: RankRow, b: RankRow) => b.totalReturn - a.totalReturn;
  const cmp: Record<RankSort, (a: RankRow, b: RankRow) => number> = {
    winRate: (a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.trades - a.trades || byReturn(a, b),
    return: byReturn,
    drawdown: (a, b) => a.maxDrawdown - b.maxDrawdown || byReturn(a, b),
    trades: (a, b) => b.trades - a.trades || byReturn(a, b),
  };
  return [...rows].sort(cmp[sort]);
}

/** 交易次數夠的才列入排名；不夠的另外列出 */
export function splitBySample(rows: readonly RankRow[]): { ranked: RankRow[]; lowSample: RankRow[] } {
  return {
    ranked: rows.filter((r) => r.trades >= MIN_TRADES),
    lowSample: rows.filter((r) => r.trades < MIN_TRADES),
  };
}

/** 勝率冠軍（只看交易次數夠的）；沒有任何策略夠格時回傳 null */
export function winRateChampion(rows: readonly RankRow[]): RankRow | null {
  return sortRows(splitBySample(rows).ranked, 'winRate')[0] ?? null;
}

/** 某個策略在一份結果裡的勝率名次（1 起算）；交易次數不夠時是 null */
export function winRateRank(result: RankResult, id: string): { row: RankRow; rank: number | null; rankedCount: number } {
  const ranked = sortRows(splitBySample(result.rows).ranked, 'winRate');
  const row = result.rows.find((r) => r.def.id === id)!;
  const i = ranked.findIndex((r) => r.def.id === id);
  return { row, rank: i >= 0 ? i + 1 : null, rankedCount: ranked.length };
}

export interface AdjacentCheck {
  /** next：這段期間的冠軍，到下一段期間表現如何；prev：上一段期間的冠軍，到這段期間表現如何 */
  direction: 'next' | 'prev';
  champion: RankRow;
  base: RankResult;
  other: RankResult;
  otherRow: RankRow;
  otherRank: number | null;
  otherRankedCount: number;
}

/**
 * 「冠軍換到另一段期間還有效嗎？」：優先看「下一段同樣長度」的期間；
 * 如果選的期間已經到最新的資料（後面沒有資料），改看「上一段期間的冠軍」到這段期間的表現。
 */
export function adjacentCheck(prep: Prepared, start: number, end: number, cfg: BacktestConfig, current?: RankResult): AdjacentCheck | null {
  const len = end - start + 1;
  const last = prep.candles.length - 1;
  const minLen = Math.max(30, Math.floor(len / 2));
  const here = current ?? runRanking(prep, start, end, cfg);
  let direction: AdjacentCheck['direction'];
  let base: RankResult;
  let other: RankResult;
  if (Math.min(last, end + len) - end >= minLen) {
    direction = 'next';
    base = here;
    other = runRanking(prep, end + 1, Math.min(last, end + len), cfg);
  } else if (start - Math.max(0, start - len) >= minLen) {
    direction = 'prev';
    base = runRanking(prep, Math.max(0, start - len), start - 1, cfg);
    other = here;
  } else {
    return null;
  }
  const champion = winRateChampion(base.rows);
  if (!champion) return null;
  const r = winRateRank(other, champion.def.id);
  return { direction, champion, base, other, otherRow: r.row, otherRank: r.rank, otherRankedCount: r.rankedCount };
}

export interface YearChampion {
  year: number;
  champion: RankRow;
  rankedCount: number;
  nextYear: number;
  /** 隔年還沒過完（例如今年） */
  nextPartial: boolean;
  next: RankRow;
  nextRank: number | null;
  nextRankedCount: number;
  nextBenchmark: EquityMetrics;
}

/** 每個完整年度的勝率冠軍，以及它隔年的表現（看「冠軍會不會連莊」） */
export function yearlyChampions(prep: Prepared, cfg: BacktestConfig): YearChampion[] {
  const c = prep.candles;
  if (c.length < 2) return [];
  const firstYear = Number(c[0]!.time.slice(0, 4));
  const lastYear = Number(c[c.length - 1]!.time.slice(0, 4));
  const lastTime = c[c.length - 1]!.time;
  // 資料從年中才開始的那一年不算（指標暖身、期間不完整）
  const startYear = c[0]!.time.slice(5) <= '01-10' ? firstYear : firstYear + 1;
  const out: YearChampion[] = [];
  for (let y = startYear; y < lastYear; y++) {
    const a = indexRange(c, `${y}-01-01`, `${y}-12-31`);
    const b = indexRange(c, `${y + 1}-01-01`, `${y + 1}-12-31`);
    if (!a || !b || b.end - b.start + 1 < 60) continue;
    const base = runRanking(prep, a.start, a.end, cfg);
    const champion = winRateChampion(base.rows);
    if (!champion) continue;
    const next = runRanking(prep, b.start, b.end, cfg);
    const r = winRateRank(next, champion.def.id);
    out.push({
      year: y,
      champion,
      rankedCount: splitBySample(base.rows).ranked.length,
      nextYear: y + 1,
      nextPartial: y + 1 === lastYear && lastTime.slice(5) < '12-24',
      next: r.row,
      nextRank: r.rank,
      nextRankedCount: r.rankedCount,
      nextBenchmark: next.benchmark,
    });
  }
  return out;
}
