import { fmtNum } from '../../data/format';
import { closes, highest, highs, lowest, lows, scanSignals, zip } from '../math/core';
import { getLine, type IndicatorDef } from '../types';

export type DonchianParams = { period: number; exitPeriod: number };

export const donchianIndicator: IndicatorDef<DonchianParams> = {
  id: 'donchian',
  shortName: '唐奇安通道',
  name: '唐奇安通道',
  enName: 'Donchian Channel',
  category: 'trend',
  placement: 'overlay',
  params: [
    { key: 'period', type: 'number', label: '通道天數（進場）', min: 5, max: 120, step: 1 },
    {
      key: 'exitPeriod',
      type: 'number',
      label: '出場天數',
      min: 3,
      max: 120,
      step: 1,
      help: '跌破最近幾天的最低點就出場（海龜法則是 10 天）。',
    },
  ],
  defaults: { period: 20, exitPeriod: 10 },
  presets: [
    { label: '海龜短線 20／10', values: { period: 20, exitPeriod: 10 } },
    { label: '海龜長線 55／20', values: { period: 55, exitPeriod: 20 } },
  ],
  compute(candles, p) {
    const upper = highest(highs(candles), p.period);
    const lower = lowest(lows(candles), p.period);
    return {
      lines: [
        { key: 'upper', label: `上軌（${p.period} 日高點）`, values: upper, kind: 'line', color: 's3', width: 1 },
        { key: 'lower', label: `下軌（${p.period} 日低點）`, values: lower, kind: 'line', color: 's3', width: 1 },
        {
          key: 'middle',
          label: '中線',
          values: zip(upper, lower, (a, b) => (a + b) / 2),
          kind: 'line',
          color: 's3',
          width: 1,
          dashed: true,
        },
        {
          key: 'exit',
          label: `出場線（${p.exitPeriod} 日低點）`,
          values: lowest(lows(candles), p.exitPeriod),
          kind: 'line',
          color: 'muted',
          width: 1,
          dashed: true,
        },
      ],
      fills: [{ upper: 'upper', lower: 'lower', color: 's3', opacity: 0.06 }],
    };
  },
  signals(candles, r) {
    const close = closes(candles);
    const upper = getLine(r, 'upper');
    const exit = getLine(r, 'exit');
    const breakout = (i: number) => {
      const u = upper[i - 1];
      return i >= 1 && u != null && (close[i] as number) > u;
    };
    const breakdown = (i: number) => {
      const e = exit[i - 1];
      return i >= 1 && e != null && (close[i] as number) < e;
    };
    // 只標記「第一天」突破／跌破，避免強勢時每天都出現訊號
    return scanSignals(
      candles.length,
      (i) => breakout(i) && !breakout(i - 1),
      (i) => breakdown(i) && !breakdown(i - 1),
      '突破通道上軌',
      '跌破出場線',
    );
  },
  describe(candles, r, p) {
    const n = candles.length;
    const u = getLine(r, 'upper')[n - 1];
    const l = getLine(r, 'lower')[n - 1];
    if (u == null || l == null) return null;
    const c = candles[n - 1]!;
    const pos = u > l ? ((c.close - l) / (u - l)) * 100 : 50;
    if (c.high >= u) {
      return {
        tone: 'bullish',
        headline: `創 ${p.period} 日新高`,
        detail: `今天的最高價碰到通道上軌 ${fmtNum(u)}。突破新高是海龜法則的進場訊號。`,
      };
    }
    if (c.low <= l) {
      return {
        tone: 'bearish',
        headline: `創 ${p.period} 日新低`,
        detail: `今天的最低價碰到通道下軌 ${fmtNum(l)}，走勢偏弱。`,
      };
    }
    return {
      tone: pos >= 50 ? 'bullish' : 'bearish',
      headline: `位於通道的 ${fmtNum(pos, 0)}% 位置`,
      detail: `通道範圍 ${fmtNum(l)}～${fmtNum(u)}（0% = 下軌、100% = 上軌）。`,
    };
  },
  strategy: {
    name: '海龜法則：突破新高買、跌破低點賣',
    buyRule: '收盤價高於前一天的「N 日最高價」（突破通道上軌），隔天開盤買進。',
    sellRule: '收盤價低於前一天的「出場天數最低價」，隔天開盤賣出。',
  },
};
