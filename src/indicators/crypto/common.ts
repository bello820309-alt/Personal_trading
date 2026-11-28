import { fmtMd } from '../../data/format';
import { alignToCandles, lastDate, type ExtraKey } from '../../data/extra';
import type { Candle } from '../../data/types';
import { lastValid } from '../math/core';
import type { IndicatorContext, Series, StateSummary } from '../types';

/** 取出比特幣的額外資料，對齊到每一根 K 棒（沒有資料時全部是 null） */
export function extraSeries(ctx: IndicatorContext | undefined, key: ExtraKey, candles: Candle[]): Series {
  return alignToCandles(ctx?.extra?.series[key], candles);
}

/** 外部資料實際的最後一天（沒有資料時是 null） */
export function extraEnd(ctx: IndicatorContext | undefined, key: ExtraKey): string | null {
  const s = ctx?.extra?.series[key];
  return s ? lastDate(s) : null;
}

/** 最新的數值；如果最新資料離最後一根 K 棒太久（資料停更），回傳 null，避免拿舊資料說「現在」 */
export function freshLast(values: Series, n: number, maxLagBars = 7): number | null {
  const last = lastValid(values);
  if (!last || last.index < n - 1 - maxLagBars) return null;
  return last.value;
}

/** 資金費率為什麼會停在上個月底 */
export const FUNDING_STALE_REASON =
  '幣安的資金費率公開檔案一個月一份，那個月過完才有；網站抓資料的伺服器在美國，幣安 API 不回應。瀏覽器會試著直接向幣安補最近幾天，這次沒有補到。';

/**
 * 資料停更時（最新資料離最後一根 K 棒超過 maxLagBars 根），卡片不要只顯示「—」，
 * 而是寫出資料停在哪一天、為什麼。資料夠新或完全沒有資料時回傳 null。
 */
export function staleSummary(
  values: Series,
  candles: readonly Candle[],
  reason = '資料來源最近沒有更新，網站每天會自動再抓，有新資料就會補上。',
  dataEnd?: string | null,
  maxLagBars = 7,
): StateSummary | null {
  const last = lastValid(values);
  if (!last || last.index >= candles.length - 1 - maxLagBars) return null;
  // 對齊 K 棒時資料會往後沿用幾天，所以日期以資料實際的最後一天為準
  const t = dataEnd ?? candles[last.index]!.time;
  const md = fmtMd(t, candles[candles.length - 1]!.time);
  return {
    tone: 'neutral',
    stale: true,
    headline: `資料停在 ${md}`,
    detail: `${reason}舊資料不拿來說「現在」，所以這裡先不判斷。`,
  };
}
