import { fmtNum } from '../../data/format';
import { crossOver, crossUnder, scanSignals } from '../math/core';
import { getLine, type IndicatorDef } from '../types';
import { extraSeries, freshLast } from './common';

export type FearGreedParams = { buyBelow: number; sellAbove: number };

export const fearGreedIndicator: IndicatorDef<FearGreedParams> = {
  id: 'fear-greed',
  shortName: '恐懼貪婪',
  name: '恐懼貪婪指數',
  enName: 'Crypto Fear & Greed Index',
  category: 'crypto',
  placement: 'pane',
  assets: ['BTC'],
  requires: ['fng'],
  params: [
    { key: 'buyBelow', type: 'number', label: '買進門檻（跌破這個數字）', min: 5, max: 50, step: 1 },
    { key: 'sellAbove', type: 'number', label: '賣出門檻（突破這個數字）', min: 50, max: 95, step: 1 },
  ],
  defaults: { buyBelow: 25, sellAbove: 75 },
  compute(candles, p, ctx) {
    return {
      lines: [{ key: 'fng', label: '恐懼貪婪指數', values: extraSeries(ctx, 'fng', candles), kind: 'line', color: 's4', width: 2 }],
      levels: [
        { value: p.sellAbove, label: `極度貪婪 ${p.sellAbove}`, color: 'hot' },
        { value: 50, label: '50' },
        { value: p.buyBelow, label: `極度恐懼 ${p.buyBelow}`, color: 'cold' },
      ],
      scale: { min: 0, max: 100 },
    };
  },
  signals(candles, r, p) {
    const v = getLine(r, 'fng');
    return scanSignals(
      candles.length,
      (i) => crossUnder(v, p.buyBelow, i),
      (i) => crossOver(v, p.sellAbove, i),
      '跌進極度恐懼',
      '漲進極度貪婪',
    );
  },
  describe(candles, r, p) {
    const x = freshLast(getLine(r, 'fng'), candles.length);
    if (x === null) return null;
    const v = fmtNum(x, 0);
    if (x < p.buyBelow) {
      return {
        tone: 'cold',
        headline: `恐懼貪婪指數 ${v}：極度恐懼`,
        detail: '市場一片恐慌。不少中長期的低點出現在這種時候，但恐慌也可能持續好幾週，價格可能繼續跌。',
      };
    }
    if (x < 45) return { tone: 'bearish', headline: `恐懼貪婪指數 ${v}：恐懼`, detail: '市場氣氛偏悲觀，大家比較小心。' };
    if (x <= 55) return { tone: 'neutral', headline: `恐懼貪婪指數 ${v}：中性`, detail: '市場情緒不算樂觀也不算悲觀。' };
    if (x <= p.sellAbove) return { tone: 'bullish', headline: `恐懼貪婪指數 ${v}：貪婪`, detail: '市場氣氛偏樂觀，追價的人變多。' };
    return {
      tone: 'hot',
      headline: `恐懼貪婪指數 ${v}：極度貪婪`,
      detail: '市場很狂熱。短期過熱的風險變高，但多頭行情裡也可能維持貪婪很久。',
    };
  },
  strategy: {
    name: '跌進極度恐懼買、漲進極度貪婪賣（反向操作）',
    buyRule: '指數由上往下跌破 25（進入「極度恐懼」），隔天開盤買進。',
    sellRule: '指數由下往上突破 75（進入「極度貪婪」），隔天開盤賣出。',
  },
};
