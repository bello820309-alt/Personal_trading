import { fmtNum } from '../../data/format';
import { atrWilder, validSlice } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type AtrParams = { period: number };

export const atrIndicator: IndicatorDef<AtrParams> = {
  id: 'atr',
  shortName: 'ATR',
  name: '平均真實區間',
  enName: 'Average True Range',
  category: 'volatility',
  placement: 'pane',
  params: [{ key: 'period', type: 'number', label: '天數', min: 2, max: 100, step: 1 }],
  defaults: { period: 14 },
  compute(candles, p) {
    const atr = atrWilder(candles, p.period);
    const pct: Series = atr.map((a, i) => (a == null ? null : (a / candles[i]!.close) * 100));
    return {
      lines: [
        { key: 'atr', label: `ATR(${p.period})`, values: atr, kind: 'line', color: 's0', width: 2 },
        { key: 'atrPct', label: 'ATR 占股價 %', values: pct, kind: 'line', color: 'muted', hidden: true, unit: 'percent' },
      ],
    };
  },
  describe(candles, r, p) {
    const n = candles.length;
    const a = getLine(r, 'atr')[n - 1];
    const pctLine = getLine(r, 'atrPct');
    const pct = pctLine[n - 1];
    if (a == null || pct == null) return null;
    const hist = validSlice(pctLine, n - 250, n);
    const avg = hist.reduce((s, v) => s + v, 0) / Math.max(1, hist.length);
    const ratio = avg > 0 ? pct / avg : 1;
    const cmp =
      ratio > 1.3 ? '明顯高於' : ratio > 1.05 ? '略高於' : ratio < 0.7 ? '明顯低於' : ratio < 0.95 ? '略低於' : '接近';
    return {
      tone: 'neutral',
      headline: `ATR(${p.period}) = ${fmtNum(a)}（約股價的 ${fmtNum(pct, 2)}%）`,
      detail: `最近平均每天的波動約 ${fmtNum(a)}，${cmp}過去一年的平均水準（${fmtNum(avg, 2)}%）。ATR 只看波動大小、不分漲跌。`,
    };
  },
  noSignalReason:
    'ATR 只衡量「每天大概會晃多少」，不分漲跌，所以本身不會產生買賣訊號。它最常用來設定停損距離（例如「跌破買價 2 倍 ATR 就停損」）或決定部位大小。',
};
