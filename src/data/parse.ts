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

/**
 * 只取已收盤的 K 棒：指標的「現在怎麼說」要用這個算。
 * 比特幣網頁開著時會接上幣安的盤中 K 棒，成交量只累積到當下，拿來算會變成「量縮」之類的錯誤說法。
 */
export function completedCandles(series: AssetSeries): Candle[] {
  const n = completedLength(series);
  return n === series.candles.length ? series.candles : series.candles.slice(0, n);
}

/** 價格卡上的價格是「收盤價」還是盤中的「目前價格」 */
export function priceLabel(series: AssetSeries): '收盤價' | '目前價格' {
  return series.meta.lastBarComplete ? '收盤價' : '目前價格';
}
