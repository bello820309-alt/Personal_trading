import { fmtNum, fmtPctValue } from '../../data/format';
import { closes, crossOver, crossUnder, nulls, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef, type IndicatorResult } from '../types';

export type RocParams = { period: number; signalPeriod: number };

export const rocIndicator: IndicatorDef<RocParams> = {
  id: 'roc',
  shortName: 'ROC',
  name: '變動率指標（含動量 MTM）',
  enName: 'Rate of Change / Momentum',
  category: 'momentum',
  placement: 'pane',
  params: [
    { key: 'period', type: 'number', label: '比較幾天前', min: 2, max: 120, step: 1 },
    { key: 'signalPeriod', type: 'number', label: '平均線天數（0 = 不顯示）', min: 0, max: 60, step: 1 },
  ],
  defaults: { period: 12, signalPeriod: 6 },
  compute(candles, p) {
    const close = closes(candles);
    const n = close.length;
    const roc = nulls(n);
    const per = Math.max(1, Math.floor(p.period));
    for (let i = per; i < n; i++) {
      const prev = close[i - per] as number;
      roc[i] = prev === 0 ? 0 : (((close[i] as number) - prev) / prev) * 100;
    }
    const lines: IndicatorResult['lines'] = [
      { key: 'roc', label: `ROC(${per})`, values: roc, kind: 'line', color: 's1', width: 2, unit: 'percent' },
    ];
    if (p.signalPeriod > 1) {
      lines.push({
        key: 'rocMa',
        label: `ROC 平均(${p.signalPeriod})`,
        values: sma(roc, p.signalPeriod),
        kind: 'line',
        color: 's0',
        width: 1,
        unit: 'percent',
      });
    }
    return { lines, levels: [{ value: 0, label: '0' }] };
  },
  signals(candles, r) {
    const roc = getLine(r, 'roc');
    return scanSignals(
      candles.length,
      (i) => crossOver(roc, 0, i),
      (i) => crossUnder(roc, 0, i),
      '動能翻正',
      '動能翻負',
    );
  },
  describe(candles, r, p) {
    const n = candles.length;
    const v = getLine(r, 'roc')[n - 1];
    const prev = getLine(r, 'roc')[n - 2];
    if (v == null) return null;
    const accel = prev == null ? '' : v > prev ? '，而且比昨天更強' : '，但比昨天弱一些';
    return {
      tone: v > 0 ? 'bullish' : v < 0 ? 'bearish' : 'neutral',
      headline: `ROC(${p.period}) = ${fmtNum(v, 2)}%`,
      detail: `和 ${p.period} 天前相比${v >= 0 ? '上漲' : '下跌'} ${fmtPctValue(Math.abs(v), 2, false)}${accel}。ROC 在 0 以上代表動能向上。`,
    };
  },
  strategy: {
    name: '動能翻正買、翻負賣',
    buyRule: 'ROC 由負轉正（漲過 N 天前的價格），隔天開盤買進。',
    sellRule: 'ROC 由正轉負（跌破 N 天前的價格），隔天開盤賣出。',
  },
};
