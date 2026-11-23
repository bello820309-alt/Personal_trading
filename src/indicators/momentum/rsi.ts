import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, firstValid, nulls, rma, scanSignals } from '../math/core';
import { zoneNote } from '../math/after';
import { getLine, type IndicatorDef, type IndicatorResult, type Series, type StateSummary, notesOf } from '../types';

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
  /** 有給的話，另外數出「過去到超買、超賣區之後價格怎麼走」 */
  hist?: { candles: readonly { close: number }[]; line: Series },
): StateSummary {
  const v = fmtNum(value, digits);
  if (value >= overbought) {
    return {
      tone: 'hot',
      headline: `${name} = ${v}，進入超買區`,
      detail: `高於 ${overbought}：短期漲得比較急。這不等於馬上會跌，強勢行情中可能在超買區停留很久。`,
      notes: notesOf(['過去到超買區之後', hist && zoneNote(hist.candles, hist.line, (x) => x >= overbought, `${name} 在 ${overbought} 以上`, 'down')]),
    };
  }
  if (value <= oversold) {
    return {
      tone: 'cold',
      headline: `${name} = ${v}，進入超賣區`,
      detail: `低於 ${oversold}：短期跌得比較急。這不等於馬上會反彈，弱勢行情中可能一直停在超賣區。`,
      notes: notesOf(['過去到超賣區之後', hist && zoneNote(hist.candles, hist.line, (x) => x <= oversold, `${name} 在 ${oversold} 以下`, 'up')]),
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

/**
 * 背離：寫出最近兩個低點（或高點）的價格和指標數值，讓人自己對照。
 * 最近的低點取最近 10 根 K 棒的最低收盤；前一個取再往前 11～40 根之間的最低收盤（兩個低點至少隔幾天，太近的不算）。
 */
export function divergenceText(candles: readonly { time: string; close: number }[], line: Series, name: string, side: 'low' | 'high'): string {
  const n = candles.length;
  if (n < 45) return '';
  const pick = (from: number, to: number) => {
    let best = -1;
    for (let i = Math.max(0, from); i <= to; i++) {
      if (line[i] == null) continue;
      if (best < 0 || (side === 'low' ? candles[i]!.close < candles[best]!.close : candles[i]!.close > candles[best]!.close)) best = i;
    }
    return best;
  };
  const i1 = pick(n - 10, n - 1);
  const i0 = pick(n - 40, n - 11);
  if (i1 < 0 || i0 < 0) return '';
  const md = (i: number) => `${Number(candles[i]!.time.slice(5, 7))}/${Number(candles[i]!.time.slice(8, 10))}`;
  const p1 = candles[i1]!.close, p0 = candles[i0]!.close, r1 = line[i1]!, r0 = line[i0]!;
  const word = side === 'low' ? '低' : '高';
  const head = `最近 10 根 K 棒收盤最${word}是 ${md(i1)} 的 ${fmtNum(p1)}（${name} ${fmtNum(r1, 1)}）；再往前 11～40 根之間最${word}是 ${md(i0)} 的 ${fmtNum(p0)}（${name} ${fmtNum(r0, 1)}）。`;
  const priceNew = side === 'low' ? p1 < p0 : p1 > p0;
  const lineNew = side === 'low' ? r1 < r0 : r1 > r0;
  const verdict = priceNew && !lineNew
    ? `價格比前一個${word}點更${word}、${name} 卻沒有，符合「${side === 'low' ? '底' : '頂'}背離」的樣子。背離只是提醒，不代表馬上會轉向，也可能一直背離下去。`
    : priceNew
      ? `價格和 ${name} 都比前一個${word}點更${word}，方向一致，沒有背離。`
      : `價格沒有比前一個${word}點更${word}，談不上背離。`;
  return `${head}${verdict}本站沒有回測背離的規則。`;
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
    const n = candles.length;
    const rsi = getLine(r, 'rsi');
    const v = rsi[n - 1];
    if (v == null) return null;
    const name = `RSI(${p.period})`;
    const base = describeOscillator(name, v, p.overbought, p.oversold, 50, 1, { candles, line: rsi });
    // 今天剛好出現回測規則的訊號（圖上的箭頭）
    const signal = crossOver(rsi, p.oversold, n - 1)
      ? `今天 ${name} 從 ${p.oversold} 以下回到 ${p.oversold} 以上，這就是本站回測規則的買進訊號（圖上的箭頭），照回測的規則是隔天開盤買。`
      : crossUnder(rsi, p.overbought, n - 1)
        ? `今天 ${name} 從 ${p.overbought} 以上掉回 ${p.overbought} 以下，這就是本站回測規則的賣出訊號（圖上的箭頭），照回測的規則是隔天開盤賣。`
        : '';
    return { ...base, notes: notesOf(['今天的訊號', signal], ['有沒有背離', divergenceText(candles, rsi, name, v < 50 ? 'low' : 'high')], ...(base.notes ?? []).map((x) => [x.title, x.text] as [string, string])) };
  },
  strategy: {
    name: '超賣回升買、超買回落賣',
    buyRule: 'RSI 由下往上穿越超賣門檻（例如從 25 回到 30 以上），隔天開盤買進。',
    sellRule: 'RSI 由上往下跌破超買門檻（例如從 75 掉回 70 以下），隔天開盤賣出。',
  },
};
