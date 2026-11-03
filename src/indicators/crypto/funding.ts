import { fmtNum } from '../../data/format';
import { crossOver, crossUnder, scanSignals, sma } from '../math/core';
import { getLine, type ColorRole, type IndicatorDef } from '../types';
import { extraSeries, freshLast } from './common';

export type FundingParams = { smooth: number; buyBelow: number; sellAbove: number };

export const fundingIndicator: IndicatorDef<FundingParams> = {
  id: 'funding',
  shortName: '資金費率',
  name: '永續合約資金費率',
  enName: 'Perpetual Funding Rate',
  category: 'crypto',
  placement: 'pane',
  assets: ['BTC'],
  requires: ['funding'],
  params: [
    { key: 'smooth', type: 'number', label: '平均天數', min: 1, max: 30, step: 1, help: '每天的費率起伏很大，用幾天的平均來判斷比較穩。' },
    { key: 'buyBelow', type: 'number', label: '買進門檻（%，跌破）', min: -0.05, max: 0.02, step: 0.005 },
    { key: 'sellAbove', type: 'number', label: '賣出門檻（%，突破）', min: 0.01, max: 0.2, step: 0.005 },
  ],
  defaults: { smooth: 7, buyBelow: 0, sellAbove: 0.03 },
  compute(candles, p, ctx) {
    // 存的是比例（0.0001），畫成百分比（0.01%）
    const pct = extraSeries(ctx, 'funding', candles).map((x) => (x === null ? null : x * 100));
    const colors: (ColorRole | null)[] = pct.map((x) => (x === null ? null : x >= 0 ? 'hot' : 'cold'));
    return {
      lines: [
        { key: 'funding', label: '每日資金費率', values: pct, kind: 'histogram', color: 'hot', colors, unit: 'percent' },
        { key: 'avg', label: `${p.smooth} 日平均`, values: sma(pct, p.smooth), kind: 'line', color: 'accent', width: 2, unit: 'percent' },
      ],
      levels: [
        { value: p.sellAbove, label: `過熱 ${p.sellAbove}%`, color: 'hot' },
        { value: 0.01, label: '常見基準 0.01%' },
        { value: p.buyBelow, label: `${p.buyBelow}%`, color: 'cold' },
      ],
      legendOrder: ['avg', 'funding'],
    };
  },
  signals(candles, r, p) {
    const avg = getLine(r, 'avg');
    return scanSignals(
      candles.length,
      (i) => crossUnder(avg, p.buyBelow, i),
      (i) => crossOver(avg, p.sellAbove, i),
      '資金費率轉負',
      '資金費率過熱',
    );
  },
  describe(candles, r, p) {
    const x = freshLast(getLine(r, 'avg'), candles.length);
    if (x === null) return null;
    const v = `${fmtNum(x, 3)}%`;
    if (x >= p.sellAbove) {
      return { tone: 'hot', headline: `資金費率 ${v}：多方過熱`, detail: '做多的人願意付很高的費用，代表很多人開槓桿追漲；行情一回頭，容易出現多單連環爆倉。' };
    }
    if (x > 0.01) return { tone: 'bullish', headline: `資金費率 ${v}：偏多`, detail: '做多的人比較多，市場偏樂觀，但還不算過熱。' };
    if (x >= p.buyBelow) return { tone: 'neutral', headline: `資金費率 ${v}：正常`, detail: '在常見的基準附近，多空大致平衡。' };
    return { tone: 'cold', headline: `資金費率 ${v}：空方付錢給多方`, detail: '放空的人比較多，市場悲觀；常出現在恐慌時，空單太擠時也可能反過來被軋。' };
  },
  strategy: {
    name: '資金費率轉負買、過熱賣（反向操作）',
    buyRule: '7 日平均資金費率跌到 0% 以下（空方付錢給多方，市場悲觀），隔天開盤買進。',
    sellRule: '7 日平均資金費率升到 0.03% 以上（多方過熱、槓桿太多），隔天開盤賣出。',
  },
};
