import { closes, crossOver, crossUnder, highest, nulls, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef } from '../types';

export type ObvParams = { maPeriod: number };

export const obvIndicator: IndicatorDef<ObvParams> = {
  id: 'obv',
  shortName: 'OBV',
  name: '能量潮指標',
  enName: 'On-Balance Volume',
  category: 'volume',
  placement: 'pane',
  params: [{ key: 'maPeriod', type: 'number', label: 'OBV 均線天數', min: 2, max: 120, step: 1 }],
  defaults: { maPeriod: 20 },
  compute(candles, p) {
    const n = candles.length;
    const obv = nulls(n);
    if (n > 0) obv[0] = 0;
    for (let i = 1; i < n; i++) {
      const c = candles[i]!;
      const prev = candles[i - 1]!;
      const sign = c.close > prev.close ? 1 : c.close < prev.close ? -1 : 0;
      obv[i] = (obv[i - 1] as number) + sign * c.volume;
    }
    return {
      lines: [
        { key: 'obv', label: 'OBV', values: obv, kind: 'line', color: 's1', width: 2, unit: 'volume' },
        { key: 'obvMa', label: `OBV 均線 ${p.maPeriod}`, values: sma(obv, p.maPeriod), kind: 'line', color: 's0', width: 1, unit: 'volume' },
      ],
    };
  },
  signals(candles, r) {
    const obv = getLine(r, 'obv');
    const ma = getLine(r, 'obvMa');
    return scanSignals(
      candles.length,
      (i) => crossOver(obv, ma, i),
      (i) => crossUnder(obv, ma, i),
      'OBV 上穿均線',
      'OBV 跌破均線',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const obv = getLine(r, 'obv');
    const ma = getLine(r, 'obvMa');
    const o = obv[n - 1];
    const m = ma[n - 1];
    if (o == null || m == null) return null;
    const closeHigh = highest(closes(candles), 20)[n - 1];
    const obvHigh = highest(obv, 20)[n - 1];
    const priceAtHigh = closeHigh != null && candles[n - 1]!.close >= closeHigh;
    const obvAtHigh = obvHigh != null && o >= obvHigh;
    if (priceAtHigh && !obvAtHigh) {
      return {
        tone: 'neutral',
        headline: '量價背離：價格創 20 日新高，OBV 沒跟上',
        detail: '價格創新高，但累積的成交量沒有同步創新高，代表上漲的資金動能可能不足，要多留意。',
      };
    }
    return o > m
      ? { tone: 'bullish', headline: 'OBV 在均線之上', detail: '最近上漲日的成交量比下跌日多，資金偏向流入。' }
      : { tone: 'bearish', headline: 'OBV 在均線之下', detail: '最近下跌日的成交量比上漲日多，資金偏向流出。' };
  },
  strategy: {
    name: 'OBV 上穿均線買、跌破均線賣',
    buyRule: 'OBV 由下往上穿越自己的均線（資金開始流入），隔天開盤買進。',
    sellRule: 'OBV 由上往下跌破自己的均線（資金開始流出），隔天開盤賣出。',
  },
};
