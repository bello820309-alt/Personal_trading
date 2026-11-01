import { daysBetween, fmtDate, fmtPct } from '../../data/format';
import { closes, crossOver, crossUnder, ema, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef } from '../types';

export type MaCrossParams = { fast: number; slow: number; maType: string };

function label(p: MaCrossParams, which: 'fast' | 'slow'): string {
  return `${p.maType === 'ema' ? 'EMA' : 'MA'}${Math.floor(p[which])}`;
}

export const maCrossIndicator: IndicatorDef<MaCrossParams> = {
  id: 'ma-cross',
  shortName: '均線交叉',
  name: '黃金交叉／死亡交叉',
  enName: 'Moving Average Crossover (Golden / Death Cross)',
  category: 'trend',
  placement: 'overlay',
  params: [
    { key: 'fast', type: 'number', label: '短天期均線', min: 2, max: 200, step: 1 },
    { key: 'slow', type: 'number', label: '長天期均線', min: 3, max: 400, step: 1 },
    {
      key: 'maType',
      type: 'select',
      label: '均線種類',
      options: [
        { value: 'sma', label: '簡單移動平均（SMA）' },
        { value: 'ema', label: '指數移動平均（EMA）' },
      ],
    },
  ],
  defaults: { fast: 50, slow: 200, maType: 'sma' },
  marketDefaults: {
    tw: { fast: 20, slow: 60 },
    us: { fast: 50, slow: 200 },
    crypto: { fast: 50, slow: 200 },
  },
  presets: [
    { label: '短線 5 穿 20', values: { fast: 5, slow: 20 } },
    { label: '中線 20 穿 60（月線穿季線）', values: { fast: 20, slow: 60 } },
    { label: '長線 60 穿 240', values: { fast: 60, slow: 240 } },
    { label: '美股經典 50 穿 200', values: { fast: 50, slow: 200 } },
  ],
  compute(candles, p) {
    const close = closes(candles);
    const fn = p.maType === 'ema' ? ema : sma;
    return {
      lines: [
        { key: 'fast', label: label(p, 'fast'), values: fn(close, p.fast), kind: 'line', color: 's0', width: 2 },
        { key: 'slow', label: label(p, 'slow'), values: fn(close, p.slow), kind: 'line', color: 's1', width: 2 },
      ],
    };
  },
  signals(candles, r) {
    const fast = getLine(r, 'fast');
    const slow = getLine(r, 'slow');
    return scanSignals(
      candles.length,
      (i) => crossOver(fast, slow, i),
      (i) => crossUnder(fast, slow, i),
      '黃金交叉',
      '死亡交叉',
    );
  },
  describe(candles, r, p) {
    const n = candles.length;
    const fast = getLine(r, 'fast');
    const slow = getLine(r, 'slow');
    const f = fast[n - 1];
    const s = slow[n - 1];
    if (f === null || f === undefined || s === null || s === undefined) return null;
    let lastIdx = -1;
    for (let i = n - 1; i >= 1; i--) {
      if (crossOver(fast, slow, i) || crossUnder(fast, slow, i)) {
        lastIdx = i;
        break;
      }
    }
    const bull = f > s;
    let detail = `兩條均線相差 ${fmtPct(f / s - 1)}。`;
    if (lastIdx >= 0) {
      const kind = crossOver(fast, slow, lastIdx) ? '黃金交叉' : '死亡交叉';
      const date = candles[lastIdx]!.time;
      detail = `最近一次是 ${fmtDate(date)} 的${kind}（約 ${daysBetween(date, candles[n - 1]!.time)} 天前）。` + detail;
    }
    return {
      tone: bull ? 'bullish' : 'bearish',
      headline: `${label(p, 'fast')} 在 ${label(p, 'slow')} 之${bull ? '上' : '下'}`,
      detail,
    };
  },
  strategy: {
    name: '黃金交叉買、死亡交叉賣',
    buyRule: '短天期均線由下往上穿越長天期均線（黃金交叉），隔天開盤買進。',
    sellRule: '短天期均線由上往下跌破長天期均線（死亡交叉），隔天開盤賣出。',
  },
};
