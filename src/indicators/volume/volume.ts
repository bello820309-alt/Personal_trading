import { fmtNum } from '../../data/format';
import { sma } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type VolumeParams = { ma1: number; ma2: number };

export const volumeIndicator: IndicatorDef<VolumeParams> = {
  id: 'volume',
  shortName: '成交量',
  name: '成交量與均量線',
  enName: 'Volume',
  category: 'volume',
  placement: 'pane',
  params: [
    { key: 'ma1', type: 'number', label: '短均量天數（0 = 不顯示）', min: 0, max: 60, step: 1 },
    { key: 'ma2', type: 'number', label: '長均量天數', min: 2, max: 120, step: 1 },
  ],
  defaults: { ma1: 5, ma2: 20 },
  compute(candles, p) {
    const vol: Series = candles.map((c) => c.volume);
    const lines: ReturnType<IndicatorDef['compute']>['lines'] = [
      {
        key: 'vol',
        label: '成交量',
        values: vol,
        kind: 'histogram',
        color: 'up',
        colors: candles.map((c) => (c.close >= c.open ? 'up' : 'down')),
        unit: 'volume',
      },
    ];
    if (p.ma1 > 1) {
      lines.push({ key: 'ma1', label: `均量 ${p.ma1}`, values: sma(vol, p.ma1), kind: 'line', color: 's0', width: 1, unit: 'volume' });
    }
    lines.push({ key: 'ma2', label: `均量 ${p.ma2}`, values: sma(vol, p.ma2), kind: 'line', color: 's1', width: 1, unit: 'volume' });
    return { lines };
  },
  describe(candles, r, p) {
    const n = candles.length;
    if (n < 2) return null;
    const v = candles[n - 1]!.volume;
    const avg = getLine(r, 'ma2')[n - 1];
    if (avg == null || avg <= 0 || v <= 0) return null;
    const ratio = v / avg;
    const up = candles[n - 1]!.close > candles[n - 2]!.close;
    const down = candles[n - 1]!.close < candles[n - 2]!.close;
    const level = ratio >= 2 ? '爆量' : ratio >= 1.3 ? '量增' : ratio <= 0.6 ? '量縮' : '量能持平';
    const priceWord = up ? '價漲' : down ? '價跌' : '價平';
    let tone: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let comment = '量能沒有特別放大，訊息有限。';
    if (ratio >= 1.3 && up) {
      tone = 'bullish';
      comment = '上漲時成交量放大，代表買盤積極，上漲比較有說服力。';
    } else if (ratio >= 1.3 && down) {
      tone = 'bearish';
      comment = '下跌時成交量放大，代表賣壓沉重。';
    } else if (ratio <= 0.6) {
      comment = up ? '上漲但量縮，追價意願不強。' : down ? '下跌但量縮，賣壓可能正在減輕。' : '交易清淡，市場在觀望。';
    }
    return {
      tone,
      headline: `${priceWord}${level}（${fmtNum(ratio, 1)} 倍均量）`,
      detail: `今天的成交量是 ${p.ma2} 日均量的 ${fmtNum(ratio, 2)} 倍。${comment}`,
    };
  },
  noSignalReason:
    '成交量本身沒有方向，要搭配價格一起看（例如「價漲量增」比「價漲量縮」健康），所以不單獨產生買賣訊號。',
};
