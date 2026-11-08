import { fmtNum } from '../../data/format';
import { crossOver, crossUnder, scanSignals } from '../math/core';
import { getLine, type IndicatorDef } from '../types';
import { lastValid } from '../math/core';
import { extraSeries, freshLast } from './common';

export type MvrvParams = { low: number; high: number };

export const mvrvIndicator: IndicatorDef<MvrvParams> = {
  id: 'mvrv',
  shortName: 'MVRV',
  name: 'MVRV（市值 ÷ 平均成本）',
  enName: 'Market Value to Realized Value',
  category: 'crypto',
  placement: 'pane',
  assets: ['BTC'],
  requires: ['mvrv'],
  params: [
    { key: 'low', type: 'number', label: '低估門檻（跌破買進）', min: 0.5, max: 1.5, step: 0.05 },
    { key: 'high', type: 'number', label: '高估門檻（突破賣出）', min: 2, max: 5, step: 0.1 },
  ],
  defaults: { low: 1, high: 3.5 },
  compute(candles, p, ctx) {
    return {
      lines: [{ key: 'mvrv', label: 'MVRV', values: extraSeries(ctx, 'mvrv', candles), kind: 'line', color: 's5', width: 2 }],
      levels: [
        { value: p.high, label: `高估 ${p.high}`, color: 'hot' },
        { value: p.low, label: `低估 ${p.low}`, color: 'cold' },
      ],
    };
  },
  signals(candles, r, p) {
    const v = getLine(r, 'mvrv');
    return scanSignals(
      candles.length,
      (i) => crossUnder(v, p.low, i),
      (i) => crossOver(v, p.high, i),
      `跌破 ${p.low}（低估）`,
      `突破 ${p.high}（高估）`,
    );
  },
  describe(candles, r, p) {
    const x = freshLast(getLine(r, 'mvrv'), candles.length);
    if (x === null) return null;
    const v = fmtNum(x, 2);
    // 價格 ÷ MVRV ＝ 大家平均的買進成本（實現價格）
    const at = lastValid(getLine(r, 'mvrv'));
    const price = at ? candles[at.index]?.close : undefined;
    const cost = price && x > 0 ? ` 換算成價格，所有人的平均成本（又叫「實現價格」，＝價格 ÷ MVRV）大約是每顆 ${fmtNum(price / x, 0)} 美元。` : '';
    if (x >= p.high) return { tone: 'hot', headline: `MVRV ${v}：高估區`, detail: `市值是所有人平均成本的好幾倍，帳上獲利很大，獲利了結的賣壓也大；過去的大頂部多出現在這裡。${cost}` };
    if (x >= 2.4) return { tone: 'bullish', headline: `MVRV ${v}：偏高`, detail: `大多數人都有不錯的帳面獲利，行情偏熱，但還沒到過去的高估區。${cost}` };
    if (x >= p.low) return { tone: 'neutral', headline: `MVRV ${v}：合理區間`, detail: `市值高於平均成本，但沒有特別貴。${cost}` };
    return { tone: 'cold', headline: `MVRV ${v}：低估區`, detail: `市值低於所有人的平均成本，等於大家平均都在虧錢；過去的大底部多出現在這裡，但可能停留很久。${cost}` };
  },
  strategy: {
    name: '跌破 1 買、超過 3.5 賣（估值）',
    buyRule: 'MVRV 跌破 1（市值低於大家的平均成本，平均都在虧錢），隔天開盤買進。',
    sellRule: 'MVRV 超過 3.5（市值是平均成本的 3.5 倍以上，獲利了結的壓力大），隔天開盤賣出。',
  },
};
