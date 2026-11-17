import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, highest, lowest, scanSignals, sma } from '../math/core';
import { zoneNote } from '../math/after';
import { getLine, type IndicatorDef, type Series, notesOf } from '../types';
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
    // StochRSI 進出超買、超賣區有多頻繁：用最近一年的資料數
    const kLine = getLine(r, 'k');
    let intoHigh = 0;
    let intoLow = 0;
    const from = Math.max(1, n - 250);
    for (let i = from; i < n; i++) {
      const a = kLine[i], b = kLine[i - 1];
      if (a == null || b == null) continue;
      if (a >= p.overbought && b < p.overbought) intoHigh++;
      if (a <= p.oversold && b > p.oversold) intoLow++;
    }
    const busy = `最近 ${n - from} 根 K 棒裡，StochRSI 進入超買區 ${intoHigh} 次、超賣區 ${intoLow} 次；它是「RSI 的 RSI」，比 RSI 靈敏很多，進到超買、超賣區不代表價格已經漲很多或跌很多。`;
    if (k >= p.overbought) {
      return {
        tone: 'hot',
        headline: `${head}，超買區`,
        detail: 'RSI 正處在它自己最近區間的高檔。',
        notes: notesOf(['它多常進到超買、超賣區', busy], ['過去到超買區之後', zoneNote(candles, kLine, (x) => x >= p.overbought, `%K 在 ${p.overbought} 以上`, 'down')]),
      };
    }
    if (k <= p.oversold) {
      return {
        tone: 'cold',
        headline: `${head}，超賣區`,
        detail: 'RSI 正處在它自己最近區間的低檔。',
        notes: notesOf(['它多常進到超買、超賣區', busy], ['過去到超賣區之後', zoneNote(candles, kLine, (x) => x <= p.oversold, `%K 在 ${p.oversold} 以下`, 'up')]),
      };
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
