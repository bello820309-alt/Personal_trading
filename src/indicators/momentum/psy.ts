import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, nulls, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef } from '../types';

export type PsyParams = { period: number; overbought: number; oversold: number };

export const psyIndicator: IndicatorDef<PsyParams> = {
  id: 'psy',
  shortName: 'PSY',
  name: '心理線',
  enName: 'Psychological Line',
  category: 'momentum',
  placement: 'pane',
  params: [
    { key: 'period', type: 'number', label: '天數', min: 5, max: 60, step: 1 },
    { key: 'overbought', type: 'number', label: '過熱門檻', min: 55, max: 95, step: 1 },
    { key: 'oversold', type: 'number', label: '過冷門檻', min: 5, max: 45, step: 1 },
  ],
  defaults: { period: 12, overbought: 75, oversold: 25 },
  compute(candles, p) {
    const close = closes(candles);
    const up = nulls(close.length);
    for (let i = 1; i < close.length; i++) up[i] = (close[i] as number) > (close[i - 1] as number) ? 1 : 0;
    const psy = sma(up, p.period).map((v) => (v === null ? null : v * 100));
    return {
      lines: [{ key: 'psy', label: `PSY(${p.period})`, values: psy, kind: 'line', color: 's2', width: 2 }],
      levels: [
        { value: p.overbought, label: `過熱 ${p.overbought}` },
        { value: 50, label: '50' },
        { value: p.oversold, label: `過冷 ${p.oversold}` },
      ],
      scale: { min: 0, max: 100 },
    };
  },
  signals(candles, r, p) {
    const psy = getLine(r, 'psy');
    return scanSignals(
      candles.length,
      (i) => crossOver(psy, p.oversold, i),
      (i) => crossUnder(psy, p.overbought, i),
      '心理線脫離過冷',
      '心理線脫離過熱',
    );
  },
  describe(candles, r, p) {
    const v = getLine(r, 'psy')[candles.length - 1];
    if (v == null) return null;
    const days = Math.round((v / 100) * p.period);
    const head = `PSY = ${fmtNum(v, 1)}`;
    const detail = `最近 ${p.period} 天裡有 ${days} 天收漲。`;
    if (v >= p.overbought) return { tone: 'hot', headline: `${head}，過熱`, detail: `${detail}大家普遍樂觀，要留意追高風險。` };
    if (v <= p.oversold) return { tone: 'cold', headline: `${head}，過冷`, detail: `${detail}大家普遍悲觀，可能接近短線低點。` };
    return { tone: 'neutral', headline: head, detail: `${detail}多空情緒還算平衡。` };
  },
  strategy: {
    name: '心理線脫離過冷買、脫離過熱賣',
    buyRule: 'PSY 由下往上穿越過冷門檻（25），隔天開盤買進。',
    sellRule: 'PSY 由上往下跌破過熱門檻（75），隔天開盤賣出。',
  },
};
