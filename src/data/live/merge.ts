import { completedLength } from '../parse';
import type { AssetSeries, Candle } from '../types';
import type { LiveBar } from './binance';

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * 把即時 K 棒接到歷史資料後面：
 * - 歷史只保留「已收盤」的 K 棒（Yahoo 盤中抓到的最後一根丟掉）。
 * - 歷史最後一天之後的日子（包含今天正在形成的那根）用即時資料。
 * - 成交量：幣安只算自己一家交易所，量比 Yahoo 彙整的小很多，
 *   所以用兩邊都有資料的日子算出比例（中位數），換算到同一個量級，
 *   成交量相關的指標（OBV、MFI、均量）才不會在接縫處突然斷層。
 */
export function mergeLiveBars(series: AssetSeries, bars: LiveBar[], now: number): AssetSeries {
  const n = completedLength(series);
  const base = series.candles.slice(0, n);
  const baseAdj = series.adjClose.slice(0, n);
  const lastDate = base[n - 1]?.time ?? '';

  const byDate = new Map(base.map((c) => [c.time, c]));
  const ratios = bars
    .filter((b) => b.quoteVolume > 0 && (byDate.get(b.time)?.volume ?? 0) > 0)
    .slice(-30)
    .map((b) => byDate.get(b.time)!.volume / b.quoteVolume);
  const factor = ratios.length >= 5 ? median(ratios) : 1;

  const extra = bars.filter((b) => b.time > lastDate);
  const candles: Candle[] = [
    ...base,
    ...extra.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: Math.round(b.quoteVolume * factor),
    })),
  ];
  const last = extra[extra.length - 1];
  return {
    ...series,
    candles,
    adjClose: [...baseAdj, ...extra.map((b) => b.close)],
    meta: { ...series.meta, lastBarComplete: last ? last.closeTime < now : true },
  };
}
