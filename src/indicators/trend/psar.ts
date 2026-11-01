import { fmtNum, fmtPct } from '../../data/format';
import { nulls, scanSignals } from '../math/core';
import { getLine, type ColorRole, type IndicatorDef } from '../types';

export type PsarParams = { step: number; max: number };

export const psarIndicator: IndicatorDef<PsarParams> = {
  id: 'psar',
  shortName: 'SAR',
  name: '拋物線轉向指標',
  enName: 'Parabolic SAR (Stop and Reverse)',
  category: 'trend',
  placement: 'overlay',
  params: [
    {
      key: 'step',
      type: 'number',
      label: '加速因子（起始與每次增加）',
      min: 0.005,
      max: 0.1,
      step: 0.005,
      help: '越大越靈敏，SAR 追得越緊，翻轉次數也越多。',
    },
    { key: 'max', type: 'number', label: '加速因子上限', min: 0.05, max: 0.5, step: 0.01 },
  ],
  defaults: { step: 0.02, max: 0.2 },
  compute(candles, p) {
    const n = candles.length;
    const sar = nulls(n);
    const trend = nulls(n);
    if (n >= 2) {
      const c0 = candles[0]!;
      const c1 = candles[1]!;
      let up = c1.close >= c0.close;
      let ep = up ? Math.max(c0.high, c1.high) : Math.min(c0.low, c1.low);
      let s = up ? Math.min(c0.low, c1.low) : Math.max(c0.high, c1.high);
      let af = p.step;
      sar[1] = s;
      trend[1] = up ? 1 : -1;
      for (let i = 2; i < n; i++) {
        const c = candles[i]!;
        s = s + af * (ep - s);
        // SAR 不能進入前兩根 K 棒的範圍
        if (up) s = Math.min(s, candles[i - 1]!.low, candles[i - 2]!.low);
        else s = Math.max(s, candles[i - 1]!.high, candles[i - 2]!.high);

        if (up && c.low < s) {
          // 跌破 SAR：翻空，新的 SAR 從上一段的最高點開始
          up = false;
          s = Math.max(ep, c.high);
          ep = c.low;
          af = p.step;
        } else if (!up && c.high > s) {
          up = true;
          s = Math.min(ep, c.low);
          ep = c.high;
          af = p.step;
        } else if (up && c.high > ep) {
          ep = c.high;
          af = Math.min(af + p.step, p.max);
        } else if (!up && c.low < ep) {
          ep = c.low;
          af = Math.min(af + p.step, p.max);
        }
        sar[i] = s;
        trend[i] = up ? 1 : -1;
      }
    }
    const colors: (ColorRole | null)[] = trend.map((t) => (t === null ? null : t > 0 ? 'up' : 'down'));
    return {
      lines: [
        { key: 'sar', label: 'SAR', values: sar, kind: 'dots', color: 'hot', colors },
        { key: 'trend', label: '方向', values: trend, kind: 'line', color: 'muted', hidden: true },
      ],
    };
  },
  signals(candles, r) {
    const t = getLine(r, 'trend');
    return scanSignals(
      candles.length,
      (i) => t[i - 1] === -1 && t[i] === 1,
      (i) => t[i - 1] === 1 && t[i] === -1,
      'SAR 翻多',
      'SAR 翻空',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const s = getLine(r, 'sar')[n - 1];
    const t = getLine(r, 'trend')[n - 1];
    if (s == null || t == null) return null;
    const close = candles[n - 1]!.close;
    const up = t > 0;
    return {
      tone: up ? 'bullish' : 'bearish',
      headline: up ? 'SAR 在價格下方（多方）' : 'SAR 在價格上方（空方）',
      detail: `SAR = ${fmtNum(s)}，距離收盤價 ${fmtPct(s / close - 1)}。${
        up ? '跌破這個價位就會翻空，常被當成「移動停損」的參考。' : '漲過這個價位就會翻多。'
      }`,
    };
  },
  strategy: {
    name: 'SAR 翻多買、翻空賣',
    buyRule: '價格漲破 SAR、SAR 從上方翻到下方（翻多），隔天開盤買進。',
    sellRule: '價格跌破 SAR、SAR 從下方翻到上方（翻空），隔天開盤賣出。',
  },
};
