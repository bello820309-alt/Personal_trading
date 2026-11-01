import type { AssetDataFile, AssetSeries, Candle } from './types';

/** 把欄位陣列格式轉成 K 棒陣列 */
export function parseAssetFile(file: AssetDataFile): AssetSeries {
  const { bars, ...meta } = file;
  const n = bars.t.length;
  const candles: Candle[] = new Array(n);
  for (let i = 0; i < n; i++) {
    candles[i] = {
      time: bars.t[i]!,
      open: bars.o[i]!,
      high: bars.h[i]!,
      low: bars.l[i]!,
      close: bars.c[i]!,
      volume: bars.v[i]!,
    };
  }
  return { id: file.id, meta, candles, adjClose: bars.ac.slice() };
}

/** 回測與績效計算要排除「尚未收盤」的最後一根 */
export function completedLength(series: AssetSeries): number {
  return series.meta.lastBarComplete ? series.candles.length : Math.max(0, series.candles.length - 1);
}
