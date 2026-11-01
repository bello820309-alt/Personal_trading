import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, highest, lowest, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';
import { rsiSeries } from './rsi';

export type StochRsiParams = {
  rsiPeriod: number;
  stochPeriod: number;
  kPeriod: number;
  dPeriod: number;
  overbought: number;
  oversold: number;
};

/** 把任一數列做「隨機化」：(值 − N 日最低) ÷ (N 日最高 − N 日最低) × 100 */
export function stochOf(values: Series, period: number): Series {
  const hh = highest(values, period);
  const ll = lowest(values, period);
  let prev = 50;
  return values.map((v, i) => {
    const h = hh[i];
    const l = ll[i];
    if (v === null || h == null || l == null) return null;
    prev = h === l ? prev : ((v - l) / (h - l)) * 100;
    return prev;
  });
}

export const stochRsiIndicator: IndicatorDef<StochRsiParams> = {
  id: 'stoch-rsi',
  shortName: 'StochRSI',
  name: '隨機相對強弱指標',
  enName: 'Stochastic RSI',
  category: 'momentum',
  placement: 'pane',
  params: [
    { key: 'rsiPeriod', type: 'number', label: 'RSI 天數', min: 2, max: 60, step: 1 },
    { key: 'stochPeriod', type: 'number', label: '隨機區間天數', min: 2, max: 60, step: 1 },
    { key: 'kPeriod', type: 'number', label: '%K 平滑', min: 1, max: 10, step: 1 },
    { key: 'dPeriod', type: 'number', label: '%D 平滑', min: 1, max: 10, step: 1 },
    { key: 'overbought', type: 'number', label: '超買門檻', min: 50, max: 95, step: 1 },
    { key: 'oversold', type: 'number', label: '超賣門檻', min: 5, max: 50, step: 1 },
  ],
  defaults: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3, overbought: 80, oversold: 20 },
  compute(candles, p) {
    const st = stochOf(rsiSeries(closes(candles), p.rsiPeriod), p.stochPeriod);
    const k = sma(st, p.kPeriod);
    const d = sma(k, p.dPeriod);
    return {
      lines: [
        { key: 'k', label: '%K', values: k, kind: 'line', color: 's1', width: 2 },
        { key: 'd', label: '%D', values: d, kind: 'line', color: 's0', width: 1 },
      ],
      levels: [
        { value: p.overbought, label: `${p.overbought}` },
        { value: p.oversold, label: `${p.oversold}` },
      ],
      scale: { min: 0, max: 100 },
    };
  },
  signals(candles, r, p) {
    const k = getLine(r, 'k');
    const d = getLine(r, 'd');
    return scanSignals(
      candles.length,
      (i) => crossOver(k, d, i) && (d[i] ?? 100) < p.oversold,
      (i) => crossUnder(k, d, i) && (d[i] ?? 0) > p.overbought,
      '低檔黃金交叉',
      '高檔死亡交叉',
    );
  },
  describe(candles, r, p) {
    const n = candles.length;
    const k = getLine(r, 'k')[n - 1];
    const d = getLine(r, 'd')[n - 1];
    if (k == null || d == null) return null;
    const head = `%K ${fmtNum(k, 1)}／%D ${fmtNum(d, 1)}`;
    if (k >= p.overbought) {
      return { tone: 'hot', headline: `${head}，超買區`, detail: 'RSI 正處在最近區間的高檔。StochRSI 很靈敏，常常在超買、超賣之間快速切換。' };
    }
    if (k <= p.oversold) {
      return { tone: 'cold', headline: `${head}，超賣區`, detail: 'RSI 正處在最近區間的低檔。StochRSI 很靈敏，常常在超買、超賣之間快速切換。' };
    }
    return k > d
      ? { tone: 'bullish', headline: `${head}，%K 在 %D 之上`, detail: '短線動能偏多。' }
      : { tone: 'bearish', headline: `${head}，%K 在 %D 之下`, detail: '短線動能偏空。' };
  },
  strategy: {
    name: 'StochRSI 低檔黃金交叉買、高檔死亡交叉賣',
    buyRule: '%D 低於超賣門檻時，%K 由下往上穿越 %D，隔天開盤買進。',
    sellRule: '%D 高於超買門檻時，%K 由上往下跌破 %D，隔天開盤賣出。',
  },
};
