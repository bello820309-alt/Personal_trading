import { fmtNum } from '../../data/format';
import { closes, crossOver, nulls, percentileRank, quantile, scanSignals, sma, validSlice } from '../math/core';
import { getLine, seriesColor, type IndicatorDef, type Series } from '../types';

export type BiasParams = { periods: number[]; lookback: number; percentile: number };

function biasPeriods(p: BiasParams): number[] {
  const set = new Set<number>();
  for (const v of p.periods) {
    const x = Math.floor(Number(v));
    if (Number.isFinite(x) && x >= 2 && x <= 400) set.add(x);
  }
  const list = [...set];
  return list.length ? list.slice(0, 4) : [20];
}

/**
 * 每一根 K 棒的「過去 window 根」第 p 百分位數（不含當根，所以不會偷看未來）。
 * 用排序好的滑動視窗計算，速度比每次重新排序快很多。
 */
export function trailingQuantile(values: Series, window: number, p: number, minCount: number): Series {
  const n = values.length;
  const out = nulls(n);
  const sorted: number[] = [];
  const lowerBound = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (let i = 0; i < n; i++) {
    if (sorted.length >= minCount) out[i] = quantile(sorted, p);
    const v = values[i];
    if (v != null) sorted.splice(lowerBound(v), 0, v);
    const old = i - window >= 0 ? values[i - window] : null;
    if (old != null) sorted.splice(lowerBound(old), 1);
  }
  return out;
}

export const biasIndicator: IndicatorDef<BiasParams> = {
  id: 'bias',
  shortName: 'BIAS',
  name: '乖離率',
  enName: 'Bias Ratio',
  category: 'momentum',
  placement: 'pane',
  params: [
    { key: 'periods', type: 'list', label: '均線天數', min: 2, max: 400, maxItems: 4, help: '第一個天數用來產生訊號' },
    {
      key: 'lookback',
      type: 'number',
      label: '比較歷史的天數',
      min: 60,
      max: 1000,
      step: 10,
      help: '用過去多少天的乖離率，判斷「現在算不算偏離很多」。',
    },
    {
      key: 'percentile',
      type: 'number',
      label: '負乖離過大門檻（百分位）',
      min: 1,
      max: 30,
      step: 1,
      help: '5 代表「比過去 95% 的時候都更偏離（更低）」才算負乖離過大。',
    },
  ],
  defaults: { periods: [20, 60], lookback: 250, percentile: 5 },
  presets: [
    { label: '月線／季線乖離 20／60', values: { periods: [20, 60] } },
    { label: '傳統短線 6／12／24', values: { periods: [6, 12, 24] } },
  ],
  compute(candles, p) {
    const close = closes(candles);
    return {
      lines: biasPeriods(p).map((period, i) => {
        const ma = sma(close, period);
        const values: Series = close.map((c, j) => {
          const m = ma[j];
          return c === null || m == null || m === 0 ? null : ((c - m) / m) * 100;
        });
        return {
          key: i === 0 ? 'bias' : `bias${period}`,
          label: `BIAS(${period})`,
          values,
          kind: 'line' as const,
          color: seriesColor(i),
          width: i === 0 ? 2 : 1,
          unit: 'percent' as const,
        };
      }),
      levels: [{ value: 0, label: '0（剛好在均線上）' }],
    };
  },
  signals(candles, r, p) {
    const bias = getLine(r, 'bias');
    const th = trailingQuantile(bias, p.lookback, p.percentile, Math.floor(p.lookback / 2));
    const below = (i: number) => {
      const b = bias[i];
      const t = th[i];
      return b != null && t != null && b < t;
    };
    return scanSignals(
      candles.length,
      (i) => below(i) && !below(i - 1),
      (i) => crossOver(bias, 0, i),
      '負乖離過大',
      '回到均線',
    );
  },
  describe(candles, r, p) {
    const n = candles.length;
    const bias = getLine(r, 'bias');
    const v = bias[n - 1];
    if (v == null) return null;
    const period = biasPeriods(p)[0]!;
    const hist = validSlice(bias, n - 1 - p.lookback, n - 1);
    const head = `BIAS(${period}) = ${v >= 0 ? '+' : ''}${fmtNum(v, 2)}%`;
    const where = v >= 0 ? `高於 ${period} 日均線` : `低於 ${period} 日均線`;
    if (hist.length < 30) {
      return { tone: 'neutral', headline: head, detail: `收盤價${where} ${fmtNum(Math.abs(v), 2)}%。` };
    }
    const rank = percentileRank(hist, v);
    const detail = `收盤價${where} ${fmtNum(Math.abs(v), 2)}%。和過去 ${hist.length} 天相比，現在的乖離率排在第 ${fmtNum(
      rank,
      0,
    )} 百分位（0 = 最低、100 = 最高）。`;
    if (rank >= 95) return { tone: 'hot', headline: `${head}，正乖離過大`, detail: `${detail}離均線很遠，容易回檔修正。` };
    if (rank <= p.percentile) {
      return { tone: 'cold', headline: `${head}，負乖離過大`, detail: `${detail}跌離均線很遠，容易出現反彈。` };
    }
    return { tone: 'neutral', headline: head, detail: `${detail}屬於正常範圍。` };
  },
  strategy: {
    name: '負乖離過大買、回到均線賣',
    buyRule: '乖離率跌到「過去一段時間最低的 5% 區間」（負乖離過大），隔天開盤買進。',
    sellRule: '乖離率由負轉正（價格回到均線之上），隔天開盤賣出。',
  },
};
