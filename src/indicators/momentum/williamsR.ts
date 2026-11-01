import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, highest, highs, lowest, lows, scanSignals } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type WilliamsRParams = { period: number; overbought: number; oversold: number };

export const williamsRIndicator: IndicatorDef<WilliamsRParams> = {
  id: 'williams-r',
  shortName: '%R',
  name: '威廉指標',
  enName: 'Williams %R',
  category: 'momentum',
  placement: 'pane',
  params: [
    { key: 'period', type: 'number', label: '天數', min: 3, max: 60, step: 1 },
    { key: 'overbought', type: 'number', label: '超買門檻', min: -40, max: -1, step: 1 },
    { key: 'oversold', type: 'number', label: '超賣門檻', min: -99, max: -60, step: 1 },
  ],
  defaults: { period: 14, overbought: -20, oversold: -80 },
  compute(candles, p) {
    const hh = highest(highs(candles), p.period);
    const ll = lowest(lows(candles), p.period);
    const close = closes(candles);
    const wr: Series = close.map((c, i) => {
      const h = hh[i];
      const l = ll[i];
      if (c === null || h == null || l == null) return null;
      return h === l ? -50 : ((h - c) / (h - l)) * -100;
    });
    return {
      lines: [{ key: 'wr', label: `%R(${p.period})`, values: wr, kind: 'line', color: 's4', width: 2 }],
      levels: [
        { value: p.overbought, label: `超買 ${p.overbought}` },
        { value: -50, label: '−50' },
        { value: p.oversold, label: `超賣 ${p.oversold}` },
      ],
      scale: { min: -100, max: 0 },
    };
  },
  signals(candles, r, p) {
    const wr = getLine(r, 'wr');
    return scanSignals(
      candles.length,
      (i) => crossOver(wr, p.oversold, i),
      (i) => crossUnder(wr, p.overbought, i),
      '脫離超賣區',
      '脫離超買區',
    );
  },
  describe(candles, r, p) {
    const v = getLine(r, 'wr')[candles.length - 1];
    if (v == null) return null;
    const head = `%R = ${fmtNum(v, 1)}`;
    if (v >= p.overbought) {
      return {
        tone: 'hot',
        headline: `${head}，超買區`,
        detail: `收盤價接近最近 ${p.period} 天的最高價（高於 ${p.overbought}）。`,
      };
    }
    if (v <= p.oversold) {
      return {
        tone: 'cold',
        headline: `${head}，超賣區`,
        detail: `收盤價接近最近 ${p.period} 天的最低價（低於 ${p.oversold}）。`,
      };
    }
    return v > -50
      ? { tone: 'bullish', headline: `${head}，偏強`, detail: `收盤價在最近 ${p.period} 天區間的上半部。` }
      : { tone: 'bearish', headline: `${head}，偏弱`, detail: `收盤價在最近 ${p.period} 天區間的下半部。` };
  },
  strategy: {
    name: '脫離超賣買、脫離超買賣',
    buyRule: '%R 由下往上穿越超賣門檻（−80），隔天開盤買進。',
    sellRule: '%R 由上往下跌破超買門檻（−20），隔天開盤賣出。',
  },
};
