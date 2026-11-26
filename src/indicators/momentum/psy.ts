import { zoneNote } from '../math/after';
import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, nulls, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef, notesOf } from '../types';

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
    const psy = getLine(r, 'psy');
    const rule = `本站回測的買進是 PSY 從 ${p.oversold} 以下回到 ${p.oversold} 以上（脫離過冷）的那天，賣出是從 ${p.overbought} 以上掉回 ${p.overbought} 以下（脫離過熱）的那天，不是一進入過冷、過熱就買賣；所以現在雖然${v <= p.oversold ? '過冷' : '過熱'}，「最近一次回測訊號」可能是上一次脫離${v <= p.oversold ? '過冷' : '過熱'}的時候。`;
    if (v >= p.overbought)
      return {
        tone: 'hot',
        headline: `${head}，過熱`,
        detail: `${detail}上漲的天數特別多，大家普遍樂觀。`,
        notes: notesOf(['過去到過熱之後', zoneNote(candles, psy, (x) => x >= p.overbought, `PSY 在 ${p.overbought} 以上`, 'down')], ['回測什麼時候買賣', rule]),
      };
    if (v <= p.oversold)
      return {
        tone: 'cold',
        headline: `${head}，過冷`,
        detail: `${detail}下跌的天數特別多，大家普遍悲觀。`,
        notes: notesOf(['過去到過冷之後', zoneNote(candles, psy, (x) => x <= p.oversold, `PSY 在 ${p.oversold} 以下`, 'up')], ['回測什麼時候買賣', rule]),
      };
    return { tone: 'neutral', headline: head, detail: `${detail}多空情緒還算平衡。` };
  },
  strategy: {
    name: '心理線脫離過冷買、脫離過熱賣',
    buyRule: 'PSY 由下往上穿越過冷門檻（25），隔天開盤買進。',
    sellRule: 'PSY 由上往下跌破過熱門檻（75），隔天開盤賣出。',
  },
};
