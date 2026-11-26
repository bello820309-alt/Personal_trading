import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, firstValid, nulls, rma, scanSignals } from '../math/core';
import { zoneNote } from '../math/after';
import { dmiIndicator } from '../trend/dmi';
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

  // 前一個低點（高點）要是真的「轉折點」：比前後各 3 根都低（高）；剛好落在分界、還在一路往下的那一天不算
  const isTurn = (i: number) => {
    for (let j = i - 3; j <= i + 3; j++) {
      if (j === i || j < 0 || j >= n) continue;
      if (side === 'low' ? candles[j]!.close < candles[i]!.close : candles[j]!.close > candles[i]!.close) return false;
    }
    return true;
  };
  // 最近的低點（高點）也要是轉折：比前 3 根都低（高）；右邊不到 3 根時只看有的
  let i1 = -1;
  for (let i = n - 10; i <= n - 1; i++) {
    if (line[i] == null || !isTurn(i)) continue;
    if (i1 < 0 || (side === 'low' ? candles[i]!.close < candles[i1]!.close : candles[i]!.close > candles[i1]!.close)) i1 = i;
  }
  let i0 = -1;
  for (let i = Math.max(0, n - 40); i <= n - 11; i++) {
    if (line[i] == null || !isTurn(i)) continue;
    if (i0 < 0 || (side === 'low' ? candles[i]!.close < candles[i0]!.close : candles[i]!.close > candles[i0]!.close)) i0 = i;
  }
  if (i0 < 0) return `再往前 11～40 根之間沒有明顯的${side === 'low' ? '低' : '高'}點（比前後各 3 根都${side === 'low' ? '低' : '高'}的轉折），沒辦法比較背離。`;
  if (i1 < 0) return `最近 10 根 K 棒裡沒有明顯的${side === 'low' ? '低' : '高'}點（比前後各 3 根都${side === 'low' ? '低' : '高'}的轉折；例如一路往下時，最近 10 根的最高點只是一開始那天，不算轉折），沒辦法比較背離。`;
  const md = (i: number) => `${Number(candles[i]!.time.slice(5, 7))}/${Number(candles[i]!.time.slice(8, 10))}`;
  const p1 = candles[i1]!.close, p0 = candles[i0]!.close, r1 = line[i1]!, r0 = line[i0]!;
  const word = side === 'low' ? '低' : '高';
  const edge = n - 1 - i1 < 3 ? `（${md(i1)} 之後只有 ${n - 1 - i1} 根 K 棒，右邊還不到 3 根，先只看有的幾根；之後幾天如果價格又比它更${word}，它就不算轉折了）` : '';
  const head = `最近 10 根 K 棒的${word}點（轉折）是 ${md(i1)} 的 ${fmtNum(p1)}（${name} ${fmtNum(r1, 1)}）${edge}；再往前 11～40 根之間的${word}點（比前後各 3 根都${word}的轉折）是 ${md(i0)} 的 ${fmtNum(p0)}（${name} ${fmtNum(r0, 1)}）。`;
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
    const md = (i: number) => `${Number(candles[i]!.time.slice(5, 7))}/${Number(candles[i]!.time.slice(8, 10))}`;
    // 趨勢強度：總覽的說法是 ADX 25 以上以趨勢指標為主，20～25 兩類都要打折看
    const adx = getLine(dmiIndicator.compute(candles, dmiIndicator.defaults), 'adx')[n - 1];
    const adxCtx =
      adx == null
        ? ''
        : adx >= 25
          ? `現在 ADX 是 ${fmtNum(adx, 1)}（25 以上）：照總覽「意見不一致時」的說法，這時以趨勢指標為主，RSI 的訊號要打折看。`
          : adx >= 20
            ? `現在 ADX 是 ${fmtNum(adx, 1)}（20～25 之間）：照總覽「意見不一致時」的說法，這時兩類指標都要打折看，可以只採用和趨勢指標意見一致的訊號，不一致就先觀望。`
            : `現在 ADX 是 ${fmtNum(adx, 1)}（20 以下，盤整）：照總覽的說法，這時 RSI 這類擺盪指標比較派得上用場。`;
    // 背離成立時也一起提醒趨勢強度
    const withAdx = (t: string) => (t.includes('背離」的樣子') ? `${t}${adxCtx}` : t);
    const buyNow = crossOver(rsi, p.oversold, n - 1);
    const sellNow = crossUnder(rsi, p.overbought, n - 1);
    let signal = '';
    if (buyNow || sellNow) {
      signal = buyNow
        ? `今天 ${name} 從 ${p.oversold} 以下回到 ${p.oversold} 以上，這就是本站回測規則的買進訊號（圖上的箭頭），照回測的規則是隔天開盤買。${adxCtx}`
        : `今天 ${name} 從 ${p.overbought} 以上掉回 ${p.overbought} 以下，這就是本站回測規則的賣出訊號（圖上的箭頭），照回測的規則是隔天開盤賣。${adxCtx}`;
    } else {
      // 今天沒有訊號：寫出最近一次是哪天，免得以為是沒顯示
      let k = -1;
      for (let i = n - 2; i >= 1 && i >= n - 250; i--) {
        if (crossOver(rsi, p.oversold, i) || crossUnder(rsi, p.overbought, i)) {
          k = i;
          break;
        }
      }
      signal =
        k >= 0
          ? `今天沒有回測規則的買賣訊號。最近一次是 ${md(k)} 的${crossOver(rsi, p.oversold, k) ? `買進訊號（${name} 從 ${p.oversold} 以下回到 ${p.oversold} 以上）` : `賣出訊號（${name} 從 ${p.overbought} 以上掉回 ${p.overbought} 以下）`}，算到今天是第 ${n - k} 根 K 棒（訊號那天算第 1 根）。`
          : '今天沒有回測規則的買賣訊號，最近一年也沒有。';
    }
    return { ...base, notes: notesOf(['今天的訊號', signal], ['低點有沒有背離', withAdx(divergenceText(candles, rsi, name, 'low'))], ['高點有沒有背離', withAdx(divergenceText(candles, rsi, name, 'high'))], ...(base.notes ?? []).map((x) => [x.title, x.text] as [string, string])) };
  },
  strategy: {
    name: '超賣回升買、超買回落賣',
    buyRule: 'RSI 由下往上穿越超賣門檻（例如從 25 回到 30 以上），隔天開盤買進。',
    sellRule: 'RSI 由上往下跌破超買門檻（例如從 75 掉回 70 以下），隔天開盤賣出。',
  },
};
