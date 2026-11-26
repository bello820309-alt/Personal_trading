import { describe, expect, it } from 'vitest';
import { computeIndicator, describeOf, getIndicator } from '../indicators/registry';
import { summaryText } from '../indicators/types';
import { completedCandles, completedLength, priceLabel } from './parse';
import type { AssetSeries, Candle } from './types';

/* 比特幣網頁開著時，最後一根是幣安的盤中 K 棒：指標的「現在怎麼說」不能拿它來算 */

const day = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);

function series(candles: Candle[], lastBarComplete: boolean): AssetSeries {
  return {
    id: 'BTC',
    meta: { lastBarComplete } as AssetSeries['meta'],
    candles,
    adjClose: candles.map((c) => c.close),
  };
}

describe('只用已收盤的 K 棒', () => {
  // 30 天量 100、價格持平；最後一根是盤中（價漲、量只累積到 40）
  const candles: Candle[] = Array.from({ length: 31 }, (_, i) => {
    const close = i === 30 ? 101 : 100;
    return { time: day(i), open: 100, high: close + 1, low: 99, close, volume: i === 30 ? 40 : 100 };
  });

  it('最後一根還沒收盤時去掉它；收盤了就全部用', () => {
    expect(completedCandles(series(candles, false))).toHaveLength(30);
    expect(completedLength(series(candles, false))).toBe(30);
    expect(completedCandles(series(candles, true))).toHaveLength(31);
  });

  it('價格卡的標籤：盤中是「目前價格」，收盤後是「收盤價」', () => {
    expect(priceLabel(series(candles, false))).toBe('目前價格');
    expect(priceLabel(series(candles, true))).toBe('收盤價');
  });

  it('成交量的狀態用已收盤的 K 棒算，不會因為盤中量還少就說成「量縮、追價意願不強」', () => {
    const def = getIndicator('volume')!;
    const live = series(candles, false);
    const withLive = describeOf(computeIndicator(def, live.candles, 'crypto', null), live.candles)!;
    // 拿盤中那根算，會變成價漲量縮
    expect(withLive.headline).toContain('量縮');
    const done = completedCandles(live);
    const d = describeOf(computeIndicator(def, done, 'crypto', null), done)!;
    expect(d.headline).not.toContain('量縮');
    expect(summaryText(d)).not.toContain('追價意願不強');
  });
});
