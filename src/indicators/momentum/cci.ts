import { fmtNum } from '../../data/format';
import { crossOver, crossUnder, nulls, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type CciParams = { period: number };

export const cciIndicator: IndicatorDef<CciParams> = {
  id: 'cci',
  shortName: 'CCI',
  name: '順勢指標',
  enName: 'Commodity Channel Index',
  category: 'momentum',
  placement: 'pane',
  params: [{ key: 'period', type: 'number', label: '天數', min: 5, max: 100, step: 1 }],
  defaults: { period: 20 },
  compute(candles, p) {
    const n = candles.length;
    const tp: Series = candles.map((c) => (c.high + c.low + c.close) / 3);
    const mean = sma(tp, p.period);
    const cci = nulls(n);
    for (let i = 0; i < n; i++) {
      const m = mean[i];
      if (m == null) continue;
      let dev = 0;
      for (let j = i - p.period + 1; j <= i; j++) dev += Math.abs((tp[j] as number) - m);
      dev /= p.period;
      cci[i] = dev === 0 ? 0 : ((tp[i] as number) - m) / (0.015 * dev);
    }
    return {
      lines: [{ key: 'cci', label: `CCI(${p.period})`, values: cci, kind: 'line', color: 's3', width: 2 }],
      levels: [
        { value: 100, label: '+100' },
        { value: 0, label: '0' },
        { value: -100, label: '−100' },
      ],
    };
  },
  signals(candles, r) {
    const cci = getLine(r, 'cci');
    return scanSignals(
      candles.length,
      (i) => crossOver(cci, 100, i),
      (i) => crossUnder(cci, 100, i),
      '突破 +100',
      '跌回 +100 以下',
    );
  },
  describe(candles, r) {
    const v = getLine(r, 'cci')[candles.length - 1];
    if (v == null) return null;
    const head = `CCI = ${fmtNum(v, 0)}`;
    if (v > 100) {
      return {
        tone: 'bullish',
        headline: `${head}，強勢區`,
        detail: '高於 +100：價格明顯高於近期平均水準。CCI 原始用法是「進入 +100 以上就順勢做多」。',
      };
    }
    if (v < -100) {
      return {
        tone: 'bearish',
        headline: `${head}，弱勢區`,
        detail: '低於 −100：價格明顯低於近期平均水準，走勢偏弱；也有人視為超賣。',
      };
    }
    return {
      tone: 'neutral',
      headline: `${head}，常態區間`,
      detail: '介於 −100 和 +100 之間：價格在正常波動範圍內，沒有明顯的強弱。',
    };
  },
  strategy: {
    name: '突破 +100 買、跌回 +100 以下賣（順勢用法）',
    buyRule: 'CCI 由下往上突破 +100，代表行情轉強，隔天開盤買進。',
    sellRule: 'CCI 由上往下跌回 +100 以下，代表強勢結束，隔天開盤賣出。',
  },
};
