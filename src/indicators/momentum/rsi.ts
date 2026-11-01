import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, firstValid, nulls, rma, scanSignals } from '../math/core';
import { getLine, type IndicatorDef, type IndicatorResult, type Series, type StateSummary } from '../types';

export type RsiParams = { period: number; period2: number; overbought: number; oversold: number };

/** Wilder 的 RSI：100 − 100 ÷ (1 + 平均漲幅 ÷ 平均跌幅) */
export function rsiSeries(values: Series, period: number): Series {
  const n = values.length;
  const gains = nulls(n);
  const losses = nulls(n);
  for (let i = firstValid(values) + 1; i < n; i++) {
    const d = (values[i] as number) - (values[i - 1] as number);
    gains[i] = d > 0 ? d : 0;
    losses[i] = d < 0 ? -d : 0;
  }
  const avgGain = rma(gains, period);
  const avgLoss = rma(losses, period);
  return avgGain.map((g, i) => {
    const l = avgLoss[i];
    if (g === null || l === null || l === undefined) return null;
    if (l === 0) return g === 0 ? 50 : 100;
    return 100 - 100 / (1 + g / l);
  });
}

/** 擺盪指標共用的區間描述（超買、超賣、偏強、偏弱） */
export function describeOscillator(
  name: string,
  value: number,
  overbought: number,
  oversold: number,
  mid: number,
  digits = 1,
): StateSummary {
  const v = fmtNum(value, digits);
  if (value >= overbought) {
    return {
      tone: 'hot',
      headline: `${name} = ${v}，進入超買區`,
      detail: `高於 ${overbought}：短期漲得比較急。注意這不等於馬上會跌，強勢行情中可能在超買區停留很久。`,
    };
  }
  if (value <= oversold) {
    return {
      tone: 'cold',
      headline: `${name} = ${v}，進入超賣區`,
      detail: `低於 ${oversold}：短期跌得比較急，可能醞釀反彈；但弱勢行情中也可能一直停在超賣區。`,
    };
  }
  if (value >= mid) {
    return {
      tone: 'bullish',
      headline: `${name} = ${v}，偏強`,
      detail: `介於 ${mid} 和 ${overbought} 之間：上漲力道略大於下跌力道。`,
    };
  }
  return {
    tone: 'bearish',
    headline: `${name} = ${v}，偏弱`,
    detail: `介於 ${oversold} 和 ${mid} 之間：下跌力道略大於上漲力道。`,
  };
}

export const rsiIndicator: IndicatorDef<RsiParams> = {
  id: 'rsi',
  shortName: 'RSI',
  name: '相對強弱指標',
  enName: 'Relative Strength Index',
  category: 'momentum',
  placement: 'pane',
  params: [
    { key: 'period', type: 'number', label: '天數', min: 2, max: 60, step: 1 },
    {
      key: 'period2',
      type: 'number',
      label: '第二條 RSI 天數',
      min: 0,
      max: 60,
      step: 1,
      help: '台股軟體常同時看 RSI(6) 和 RSI(12)；設 0 代表不顯示。',
    },
    { key: 'overbought', type: 'number', label: '超買門檻', min: 50, max: 95, step: 1 },
    { key: 'oversold', type: 'number', label: '超賣門檻', min: 5, max: 50, step: 1 },
  ],
  defaults: { period: 14, period2: 0, overbought: 70, oversold: 30 },
  marketDefaults: { tw: { period: 6, period2: 12, overbought: 80, oversold: 20 } },
  presets: [
    { label: '國際常用 RSI(14)，70／30', values: { period: 14, period2: 0, overbought: 70, oversold: 30 } },
    { label: '台股常用 RSI(6)＋RSI(12)，80／20', values: { period: 6, period2: 12, overbought: 80, oversold: 20 } },
  ],
  compute(candles, p): IndicatorResult {
    const close = closes(candles);
    const lines: IndicatorResult['lines'] = [
      { key: 'rsi', label: `RSI(${p.period})`, values: rsiSeries(close, p.period), kind: 'line', color: 's1', width: 2 },
    ];
    if (p.period2 > 1) {
      lines.push({
        key: 'rsi2',
        label: `RSI(${p.period2})`,
        values: rsiSeries(close, p.period2),
        kind: 'line',
        color: 's0',
        width: 1,
      });
    }
    return {
      lines,
      levels: [
        { value: p.overbought, label: `超買 ${p.overbought}` },
        { value: 50, label: '50' },
        { value: p.oversold, label: `超賣 ${p.oversold}` },
      ],
      scale: { min: 0, max: 100 },
    };
  },
  signals(candles, r, p) {
    const rsi = getLine(r, 'rsi');
    return scanSignals(
      candles.length,
      (i) => crossOver(rsi, p.oversold, i),
      (i) => crossUnder(rsi, p.overbought, i),
      '超賣回升',
      '超買回落',
    );
  },
  describe(candles, r, p) {
    const v = getLine(r, 'rsi')[candles.length - 1];
    if (v == null) return null;
    return describeOscillator(`RSI(${p.period})`, v, p.overbought, p.oversold, 50);
  },
  strategy: {
    name: '超賣回升買、超買回落賣',
    buyRule: 'RSI 由下往上穿越超賣門檻（例如從 25 回到 30 以上），隔天開盤買進。',
    sellRule: 'RSI 由上往下跌破超買門檻（例如從 75 掉回 70 以下），隔天開盤賣出。',
  },
};
