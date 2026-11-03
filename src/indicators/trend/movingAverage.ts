import type { Candle } from '../../data/types';
import { fmtNum, fmtPct } from '../../data/format';
import { closes, crossOver, crossUnder, ema, scanSignals, sma } from '../math/core';
import { getLine, seriesColor, type IndicatorDef, type IndicatorResult, type StateSummary } from '../types';

export type MaParams = { periods: number[]; signalPeriod: number };

/** 整理使用者輸入的週期：取整數、去重複、由小到大，並確保訊號用均線也會畫出來 */
export function maDisplayPeriods(p: MaParams): number[] {
  const set = new Set<number>();
  for (const v of [...p.periods, p.signalPeriod]) {
    const x = Math.floor(Number(v));
    if (Number.isFinite(x) && x >= 2 && x <= 1000) set.add(x);
  }
  return [...set].sort((a, b) => a - b).slice(0, 7);
}

/**
 * 價格在一部分均線之上、一部分之下時，看是哪一種（均線由短到長排列）：
 * - 跌破所有短天期、還在長天期之上：長期上升趨勢裡的回檔（不是盤整，短期其實在跌）
 * - 站上所有短天期、還在長天期之下：長期下跌趨勢裡的反彈
 * - 交錯（上上下下）：方向不明，才是整理或轉折
 */
export function phaseText(close: number, vals: { label: string; v: number }[]): string {
  const flags = vals.map((x) => close > x.v);
  const firstAbove = flags.indexOf(true);
  const firstBelow = flags.indexOf(false);
  if (firstAbove > 0 && flags.slice(firstAbove).every(Boolean)) {
    return `短天期均線都在價格上面、長天期在下面：短期在跌，長期仍向上，屬於長期上升趨勢裡的回檔。如果再跌破 ${vals[firstAbove]!.label}，長期趨勢也可能轉弱。`;
  }
  if (firstBelow > 0 && flags.slice(firstBelow).every((f) => !f)) {
    return `價格站上短天期均線、但還在長天期均線下面：短期在漲，長期仍向下，屬於長期下跌趨勢裡的反彈。要能再站上 ${vals[firstBelow]!.label}，長期趨勢才可能轉強。`;
  }
  return '長短期方向不一致，屬於整理或轉折階段。';
}

function describeMa(prefix: string, candles: Candle[], r: IndicatorResult): StateSummary | null {
  const n = candles.length;
  if (n === 0) return null;
  const close = candles[n - 1]!.close;
  const vals = r.lines
    .map((l) => ({ label: l.label, v: l.values[n - 1] }))
    .filter((x): x is { label: string; v: number } => x.v !== null && x.v !== undefined);
  if (vals.length === 0) return null;
  const above = vals.filter((x) => close > x.v);
  const below = vals.filter((x) => close <= x.v);
  let bullAlign = close > vals[0]!.v;
  let bearAlign = close < vals[0]!.v;
  for (let i = 0; i + 1 < vals.length; i++) {
    if (!(vals[i]!.v > vals[i + 1]!.v)) bullAlign = false;
    if (!(vals[i]!.v < vals[i + 1]!.v)) bearAlign = false;
  }
  const tone = above.length === vals.length ? 'bullish' : above.length === 0 ? 'bearish' : 'neutral';
  let detail: string;
  if (vals.length >= 3 && bullAlign) {
    detail = `均線「多頭排列」：價格在最上面，短天期均線在長天期之上，代表各種時間尺度的趨勢都向上。`;
  } else if (vals.length >= 3 && bearAlign) {
    detail = `均線「空頭排列」：價格在最下面，短天期均線在長天期之下，代表各種時間尺度的趨勢都向下。`;
  } else {
    const parts: string[] = [];
    if (above.length) parts.push(`在 ${above.map((x) => x.label).join('、')} 之上`);
    if (below.length) parts.push(`在 ${below.map((x) => x.label).join('、')} 之下`);
    detail = `收盤價${parts.join('，')}。${tone === 'neutral' ? phaseText(close, vals) : ''}`;
  }
  const longest = vals[vals.length - 1]!;
  detail += ` 距離 ${longest.label}（${fmtNum(longest.v)}）${fmtPct(close / longest.v - 1)}。`;
  return {
    tone,
    headline: `收盤價站上 ${above.length}／${vals.length} 條${prefix === 'EMA' ? ' EMA' : '均線'}`,
    detail,
  };
}

export function makeMovingAverage(kind: 'sma' | 'ema'): IndicatorDef<MaParams> {
  const fn = kind === 'sma' ? sma : ema;
  const prefix = kind === 'sma' ? 'MA' : 'EMA';
  const isSma = kind === 'sma';
  return {
    id: kind,
    shortName: isSma ? 'MA' : 'EMA',
    name: isSma ? '簡單移動平均線' : '指數移動平均線',
    enName: isSma ? 'Simple Moving Average' : 'Exponential Moving Average',
    category: 'trend',
    placement: 'overlay',
    params: [
      {
        key: 'periods',
        type: 'list',
        label: '均線天數',
        min: 2,
        max: 400,
        maxItems: 6,
        help: '用逗號分隔，例如 5, 20, 60',
      },
      {
        key: 'signalPeriod',
        type: 'number',
        label: '訊號用的均線',
        min: 2,
        max: 400,
        step: 1,
        help: '收盤價「站上／跌破」這條均線時產生訊號',
      },
    ],
    defaults: isSma ? { periods: [20, 50, 200], signalPeriod: 200 } : { periods: [20, 50, 200], signalPeriod: 50 },
    marketDefaults: isSma
      ? {
          tw: { periods: [5, 20, 60, 120, 240], signalPeriod: 60 },
          us: { periods: [20, 50, 200], signalPeriod: 200 },
          crypto: { periods: [7, 25, 99], signalPeriod: 99 },
        }
      : {
          tw: { periods: [5, 20, 60], signalPeriod: 20 },
          us: { periods: [20, 50, 200], signalPeriod: 50 },
          crypto: { periods: [20, 50, 200], signalPeriod: 50 },
        },
    presets: isSma
      ? [
          { label: '台股常用 5/20/60/120/240', values: { periods: [5, 20, 60, 120, 240], signalPeriod: 60 } },
          { label: '美股常用 20/50/200', values: { periods: [20, 50, 200], signalPeriod: 200 } },
          { label: '幣圈常用 7/25/99', values: { periods: [7, 25, 99], signalPeriod: 99 } },
        ]
      : [
          { label: '短中期 5/20/60', values: { periods: [5, 20, 60], signalPeriod: 20 } },
          { label: '國際常用 20/50/200', values: { periods: [20, 50, 200], signalPeriod: 50 } },
          { label: 'MACD 用的 12/26', values: { periods: [12, 26], signalPeriod: 26 } },
        ],
    compute(candles, p) {
      const close = closes(candles);
      return {
        lines: maDisplayPeriods(p).map((period, i) => ({
          key: `${prefix}${period}`,
          label: `${prefix}${period}`,
          values: fn(close, period),
          kind: 'line' as const,
          color: seriesColor(i),
          width: period === Math.floor(p.signalPeriod) ? 2 : 1,
        })),
      };
    },
    signals(candles, r, p) {
      const close = closes(candles);
      const key = `${prefix}${Math.floor(p.signalPeriod)}`;
      const ma = getLine(r, key);
      return scanSignals(
        candles.length,
        (i) => crossOver(close, ma, i),
        (i) => crossUnder(close, ma, i),
        `站上 ${key}`,
        `跌破 ${key}`,
      );
    },
    describe(candles, r) {
      return describeMa(prefix, candles, r);
    },
    strategy: {
      name: isSma ? '站上均線買、跌破均線賣' : '站上 EMA 買、跌破 EMA 賣',
      buyRule: `收盤價由下往上「站上」訊號用的${isSma ? '均線' : ' EMA'}，隔天開盤買進。`,
      sellRule: `收盤價由上往下「跌破」這條${isSma ? '均線' : ' EMA'}，隔天開盤賣出。`,
    },
  };
}

export const smaIndicator = makeMovingAverage('sma');
export const emaIndicator = makeMovingAverage('ema');
