import { alignToCandles, type ExtraKey } from '../../data/extra';
import type { Candle } from '../../data/types';
import { lastValid } from '../math/core';
import type { IndicatorContext, Series } from '../types';

/** 取出比特幣的額外資料，對齊到每一根 K 棒（沒有資料時全部是 null） */
export function extraSeries(ctx: IndicatorContext | undefined, key: ExtraKey, candles: Candle[]): Series {
  return alignToCandles(ctx?.extra?.series[key], candles);
}

/** 最新的數值；如果最新資料離最後一根 K 棒太久（資料停更），回傳 null，避免拿舊資料說「現在」 */
export function freshLast(values: Series, n: number, maxLagBars = 7): number | null {
  const last = lastValid(values);
  if (!last || last.index < n - 1 - maxLagBars) return null;
  return last.value;
}
