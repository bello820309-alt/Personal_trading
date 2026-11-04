import type { Candle } from '../../data/types';
import { daysBetween, fmtDate, fmtPct } from '../../data/format';
import { closes, crossOver, crossUnder, ema, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef } from '../types';

export type MaCrossParams = { fast: number; slow: number; maType: string };

function label(p: MaCrossParams, which: 'fast' | 'slow'): string {
  return `${p.maType === 'ema' ? 'EMA' : 'MA'}${Math.floor(p[which])}`;
}

/** K 棒是不是每天都有（比特幣週末也交易）：用來把「幾天」換算成「幾個月」 */
function tradesDaily(candles: Candle[]): boolean {
  return candles.slice(-10).some((c) => {
    const w = new Date(`${c.time}T00:00:00Z`).getUTCDay();
    return w === 0 || w === 6;
  });
}

/** 50 天 → 約 2.5 個月（股票一個月約 21 個交易日，比特幣 30 天） */
export function spanText(days: number, daily: boolean): string {
  const months = days / (daily ? 30 : 21);
  if (months < 0.75) return `約 ${Math.max(1, Math.round(days / (daily ? 7 : 5)))} 週`;
  const r = Math.round(months * 2) / 2;
  return `約 ${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)} 個月`;
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
    const close = candles[n - 1]!.close;
    const gap = f / s - 1;
    const daily = tradesDaily(candles);
    let detail = `${label(p, 'fast')} 是最近 ${p.fast} 天的平均（${spanText(p.fast, daily)}），${label(p, 'slow')} 是最近 ${p.slow} 天（${spanText(p.slow, daily)}）。兩條均線相差 ${fmtPct(gap)}。`;
    if (lastIdx >= 0) {
      const kind = crossOver(fast, slow, lastIdx) ? '黃金交叉' : '死亡交叉';
      const date = candles[lastIdx]!.time;
      detail = `最近一次是 ${fmtDate(date)} 的${kind}（約 ${daysBetween(date, candles[n - 1]!.time)} 天前）。` + detail;
    }
    // 兩條線的上下關係還沒變，但價格已經跑到另一邊：狀態不明確，提醒可能快要交叉
    let tone: 'bullish' | 'bearish' | 'neutral' = bull ? 'bullish' : 'bearish';
    const near = Math.abs(gap) < 0.03;
    if (bull && close < f && close < s) {
      tone = 'neutral';
      detail += ` 但收盤價已經跌到兩條均線下面${near ? '，兩條線也越來越近：如果繼續跌，可能快要出現死亡交叉' : '：短期走弱，要留意'}。`;
    } else if (!bull && close > f && close > s) {
      tone = 'neutral';
      detail += ` 但收盤價已經站上兩條均線${near ? '，兩條線也越來越近：如果繼續漲，可能快要出現黃金交叉' : '：短期轉強，要留意'}。`;
    }
    return {
      tone,
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
