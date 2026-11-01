import type { Candle } from '../../data/types';
import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, highest, highs, lowest, lows, scanSignals, smoothFrom } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type KdParams = { period: number; kSmooth: number; dSmooth: number; overbought: number; oversold: number };

/**
 * 台灣常用的 KD 算法：
 *   RSV = (今日收盤 − 最近 N 日最低) ÷ (最近 N 日最高 − 最近 N 日最低) × 100
 *   K = 昨日 K × 2/3 + 今日 RSV × 1/3（起始值 50）
 *   D = 昨日 D × 2/3 + 今日 K × 1/3（起始值 50）
 */
export function kdSeries(
  candles: Candle[],
  period: number,
  kSmooth: number,
  dSmooth: number,
): { rsv: Series; k: Series; d: Series } {
  const hh = highest(highs(candles), period);
  const ll = lowest(lows(candles), period);
  const close = closes(candles);
  const rsv: Series = close.map((c, i) => {
    const h = hh[i];
    const l = ll[i];
    if (c === null || h === null || h === undefined || l === null || l === undefined) return null;
    return h === l ? 50 : ((c - l) / (h - l)) * 100;
  });
  const k = smoothFrom(rsv, 1 / Math.max(1, kSmooth), 50);
  const d = smoothFrom(k, 1 / Math.max(1, dSmooth), 50);
  return { rsv, k, d };
}

export const kdIndicator: IndicatorDef<KdParams> = {
  id: 'kd',
  shortName: 'KD',
  name: '隨機指標',
  enName: 'Stochastic Oscillator（台灣 KD 算法）',
  category: 'momentum',
  placement: 'pane',
  params: [
    { key: 'period', type: 'number', label: 'RSV 天數', min: 3, max: 60, step: 1 },
    {
      key: 'kSmooth',
      type: 'number',
      label: 'K 值平滑',
      min: 1,
      max: 10,
      step: 1,
      help: '3 代表「今日 RSV 占 1/3、昨日 K 占 2/3」。',
    },
    { key: 'dSmooth', type: 'number', label: 'D 值平滑', min: 1, max: 10, step: 1 },
    { key: 'overbought', type: 'number', label: '高檔門檻', min: 50, max: 95, step: 1 },
    { key: 'oversold', type: 'number', label: '低檔門檻', min: 5, max: 50, step: 1 },
  ],
  defaults: { period: 9, kSmooth: 3, dSmooth: 3, overbought: 80, oversold: 20 },
  compute(candles, p) {
    const { k, d } = kdSeries(candles, p.period, p.kSmooth, p.dSmooth);
    return {
      lines: [
        { key: 'k', label: 'K', values: k, kind: 'line', color: 's0', width: 2 },
        { key: 'd', label: 'D', values: d, kind: 'line', color: 's1', width: 2 },
      ],
      levels: [
        { value: p.overbought, label: `${p.overbought}` },
        { value: 50, label: '50' },
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
    const k = getLine(r, 'k');
    const d = getLine(r, 'd');
    const kv = k[n - 1];
    const dv = d[n - 1];
    if (kv == null || dv == null) return null;
    let highRun = 0;
    let lowRun = 0;
    for (let i = n - 1; i >= 0 && (k[i] ?? 0) > p.overbought; i--) highRun++;
    for (let i = n - 1; i >= 0 && (k[i] ?? 100) < p.oversold; i--) lowRun++;
    const head = `K ${fmtNum(kv, 1)}／D ${fmtNum(dv, 1)}`;
    if (highRun >= 3) {
      return {
        tone: 'bullish',
        headline: `${head}，高檔鈍化`,
        detail: `K 值已連續 ${highRun} 天高於 ${p.overbought}，代表買盤很強。這時「超買」反而是強勢的表現，不宜只因為 KD 高就看空。`,
      };
    }
    if (lowRun >= 3) {
      return {
        tone: 'bearish',
        headline: `${head}，低檔鈍化`,
        detail: `K 值已連續 ${lowRun} 天低於 ${p.oversold}，賣壓很重。低檔鈍化時，KD 低不代表馬上會反彈。`,
      };
    }
    if (kv >= p.overbought) {
      return { tone: 'hot', headline: `${head}，進入高檔`, detail: `K 值高於 ${p.overbought}，短線漲多、偏熱。` };
    }
    if (kv <= p.oversold) {
      return { tone: 'cold', headline: `${head}，進入低檔`, detail: `K 值低於 ${p.oversold}，短線跌深、偏冷。` };
    }
    return kv > dv
      ? { tone: 'bullish', headline: `${head}，K 在 D 之上`, detail: 'K 值在 D 值之上，短線動能偏多。' }
      : { tone: 'bearish', headline: `${head}，K 在 D 之下`, detail: 'K 值在 D 值之下，短線動能偏空。' };
  },
  strategy: {
    name: 'KD 低檔黃金交叉買、高檔死亡交叉賣',
    buyRule: 'D 值低於低檔門檻（20）時，K 由下往上穿越 D（低檔黃金交叉），隔天開盤買進。',
    sellRule: 'D 值高於高檔門檻（80）時，K 由上往下跌破 D（高檔死亡交叉），隔天開盤賣出。',
  },
};
