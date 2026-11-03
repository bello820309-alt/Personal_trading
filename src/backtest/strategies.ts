import type { AssetConfig } from '../config/assets';
import { completedLength } from '../data/parse';
import { indexRange } from '../data/range';
import { adjustCandles } from '../data/resample';
import type { AssetSeries, Candle } from '../data/types';
import { computeIndicator, signalsOf, type ComputedIndicator } from '../indicators/registry';
import type { IndicatorDef, Params, Signal } from '../indicators/types';
import { runBacktest, type BacktestConfig, type BacktestResult } from './engine';
import { periodsPerYear } from './metrics';

export type PeriodKey = '1Y' | '3Y' | '5Y' | '10Y' | 'ALL';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '1Y': '近 1 年',
  '3Y': '近 3 年',
  '5Y': '近 5 年',
  '10Y': '近 10 年',
  ALL: '全部資料',
};

const PERIOD_YEARS: Record<PeriodKey, number> = { '1Y': 1, '3Y': 3, '5Y': 5, '10Y': 10, ALL: Infinity };

export function periodStartIndex(candles: Candle[], endIndex: number, period: PeriodKey): number {
  const years = PERIOD_YEARS[period];
  if (!Number.isFinite(years)) return 0;
  const cutoff = Date.parse(`${candles[endIndex]!.time}T00:00:00Z`) - years * 365.25 * 86400000;
  let i = endIndex;
  while (i > 0 && Date.parse(`${candles[i - 1]!.time}T00:00:00Z`) >= cutoff) i--;
  return i;
}

export function defaultCosts(asset: AssetConfig): BacktestConfig {
  return {
    initialCapital: asset.currency === 'TWD' ? 100_000 : 10_000,
    feeRate: asset.costs.feeRate,
    feeDiscount: asset.costs.feeDiscount,
    minFee: asset.costs.minFee,
    sellTaxRate: asset.costs.sellTaxRate,
  };
}

export interface IndicatorBacktest extends BacktestResult {
  candles: Candle[];
  signals: Signal[];
  computed: ComputedIndicator;
}

/** 自訂期間（YYYY-MM-DD，含頭尾），例如從策略排行榜點進來時 */
export interface CustomPeriod {
  from: string;
  to: string;
}

export type PeriodSpec = PeriodKey | CustomPeriod;

/**
 * 用「還原權息」後的日 K 回測某個指標的經典規則。
 * 指標會用全部歷史資料計算（暖身期充足），交易只在選定的期間內進行；
 * 尚未收盤的最後一根不納入。
 */
export function runIndicatorBacktest(
  series: AssetSeries,
  asset: AssetConfig,
  def: IndicatorDef,
  params: Params | null,
  period: PeriodSpec,
  cfg: BacktestConfig,
): IndicatorBacktest {
  const n = completedLength(series);
  const candles = adjustCandles(series.candles, series.adjClose).slice(0, n);
  const computed = computeIndicator(def, candles, asset.market, params);
  const signals = signalsOf(computed, candles);
  let start: number;
  let end = n - 1;
  if (typeof period === 'string') {
    start = periodStartIndex(candles, end, period);
  } else {
    const r = indexRange(candles, period.from, period.to);
    start = r?.start ?? 0;
    end = r?.end ?? end;
  }
  const ppy = periodsPerYear(candles.map((c) => c.time));
  return { ...runBacktest(candles, signals, start, end, cfg, ppy), candles, signals, computed };
}
