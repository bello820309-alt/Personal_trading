import { useMemo } from 'react';
import { RANGE_DAYS, type RangeKey } from '../store/settings';
import { adjustCandles, resample, type Timeframe } from './resample';
import type { AssetSeries, Candle } from './types';

/** 依「還原權息」與「日／週／月 K」設定整理出要畫的 K 棒 */
export function useDisplayCandles(series: AssetSeries, adjusted: boolean, timeframe: Timeframe): Candle[] {
  return useMemo(() => {
    const base = adjusted ? adjustCandles(series.candles, series.adjClose) : series.candles;
    return resample(base, timeframe).candles;
  }, [series, adjusted, timeframe]);
}

/** 區間（例如 1 年）大約對應最後幾根 K 棒 */
export function barsForRange(candles: Candle[], range: RangeKey): number {
  const n = candles.length;
  if (n === 0) return 0;
  if (range === 'ALL') return n;
  const cutoff = Date.parse(`${candles[n - 1]!.time}T00:00:00Z`) - RANGE_DAYS[range] * 86400000;
  let i = n - 1;
  while (i > 0 && Date.parse(`${candles[i - 1]!.time}T00:00:00Z`) >= cutoff) i--;
  return Math.max(10, n - i);
}
