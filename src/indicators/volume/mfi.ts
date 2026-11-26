import { crossOver, crossUnder, nulls, rollingSum, scanSignals } from '../math/core';
import { describeOscillator } from '../momentum/rsi';
import { getLine, type IndicatorDef, type Series } from '../types';

export type MfiParams = { period: number; overbought: number; oversold: number };

export const mfiIndicator: IndicatorDef<MfiParams> = {
  id: 'mfi',
  shortName: 'MFI',
  name: '資金流量指標',
  enName: 'Money Flow Index',
  category: 'volume',
  placement: 'pane',
  params: [
    { key: 'period', type: 'number', label: '天數', min: 2, max: 60, step: 1 },
    { key: 'overbought', type: 'number', label: '超買門檻', min: 50, max: 95, step: 1 },
    { key: 'oversold', type: 'number', label: '超賣門檻', min: 5, max: 50, step: 1 },
  ],
  defaults: { period: 14, overbought: 80, oversold: 20 },
  compute(candles, p) {
    const n = candles.length;
    const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
    const pos = nulls(n);
    const neg = nulls(n);
    for (let i = 1; i < n; i++) {
      const flow = tp[i]! * candles[i]!.volume;
      pos[i] = tp[i]! > tp[i - 1]! ? flow : 0;
      neg[i] = tp[i]! < tp[i - 1]! ? flow : 0;
    }
    const ps = rollingSum(pos, p.period);
    const ns = rollingSum(neg, p.period);
    const mfi: Series = ps.map((a, i) => {
      const b = ns[i];
      if (a === null || b == null) return null;
      if (b <= 0) return a <= 0 ? 50 : 100;
      return 100 - 100 / (1 + a / b);
    });
    return {
      lines: [{ key: 'mfi', label: `MFI(${p.period})`, values: mfi, kind: 'line', color: 's5', width: 2 }],
      levels: [
        { value: p.overbought, label: `超買 ${p.overbought}` },
        { value: 50, label: '50' },
        { value: p.oversold, label: `超賣 ${p.oversold}` },
      ],
      scale: { min: 0, max: 100 },
    };
  },
  signals(candles, r, p) {
    const mfi = getLine(r, 'mfi');
    return scanSignals(
      candles.length,
      (i) => crossOver(mfi, p.oversold, i),
      (i) => crossUnder(mfi, p.overbought, i),
      '資金超賣回升',
      '資金超買回落',
    );
  },
  describe(candles, r, p) {
    const v = getLine(r, 'mfi')[candles.length - 1];
    if (v == null) return null;
    const base = describeOscillator(`MFI(${p.period})`, v, p.overbought, p.oversold, 50, 1, { candles, line: getLine(r, 'mfi') });
    const th = `MFI 的過熱、過冷門檻是 ${p.overbought}／${p.oversold}。RSI 的門檻看市場：VOO、比特幣用 RSI(14) 的 70／30，和 MFI 不一樣，所以兩個數字差不多時，標籤可能一個是「偏空」、一個是「過冷」；0050 用台股習慣的 RSI(6)，門檻是 80／20，剛好和 MFI 一樣。MFI 也是擺盪指標，基礎觀念說的「擺盪指標大多數都到過冷」可以把它算進去，但要照它自己的門檻看。`;
    return { ...base, notes: [...(base.notes ?? []), { title: '門檻和 RSI 不一樣', text: th }] };
  },
  strategy: {
    name: 'MFI 超賣回升買、超買回落賣',
    buyRule: 'MFI 由下往上穿越超賣門檻（20），隔天開盤買進。',
    sellRule: 'MFI 由上往下跌破超買門檻（80），隔天開盤賣出。',
  },
};
