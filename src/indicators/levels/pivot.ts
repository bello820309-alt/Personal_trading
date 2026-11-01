import { fmtNum } from '../../data/format';
import { monthKey, weekKey, yearKey } from '../../data/resample';
import { nulls } from '../math/core';
import { getLine, type IndicatorDef } from '../types';

export type PivotParams = { basis: string };

const BASIS_LABEL: Record<string, string> = { week: '上週', month: '上個月', year: '去年' };

export const pivotIndicator: IndicatorDef<PivotParams> = {
  id: 'pivot',
  shortName: '樞軸點',
  name: '樞軸點（支撐與壓力）',
  enName: 'Pivot Points (Classic)',
  category: 'levels',
  placement: 'overlay',
  params: [
    {
      key: 'basis',
      type: 'select',
      label: '用哪一段期間計算',
      options: [
        { value: 'week', label: '上週的高低收（短線）' },
        { value: 'month', label: '上個月的高低收（中線）' },
        { value: 'year', label: '去年的高低收（長線）' },
      ],
    },
  ],
  defaults: { basis: 'month' },
  compute(candles, p) {
    const n = candles.length;
    const keyFn = p.basis === 'week' ? weekKey : p.basis === 'year' ? yearKey : monthKey;
    const P = nulls(n);
    const R1 = nulls(n);
    const S1 = nulls(n);
    const R2 = nulls(n);
    const S2 = nulls(n);
    let curKey = '';
    let cur: { h: number; l: number; c: number } | null = null;
    let prev: { h: number; l: number; c: number } | null = null;
    for (let i = 0; i < n; i++) {
      const c = candles[i]!;
      const k = keyFn(c.time);
      if (k !== curKey) {
        prev = cur;
        cur = { h: c.high, l: c.low, c: c.close };
        curKey = k;
      } else if (cur) {
        cur.h = Math.max(cur.h, c.high);
        cur.l = Math.min(cur.l, c.low);
        cur.c = c.close;
      }
      if (prev) {
        const pv = (prev.h + prev.l + prev.c) / 3;
        const range = prev.h - prev.l;
        P[i] = pv;
        R1[i] = 2 * pv - prev.l;
        S1[i] = 2 * pv - prev.h;
        R2[i] = pv + range;
        S2[i] = pv - range;
      }
    }
    return {
      lines: [
        { key: 'r2', label: 'R2 壓力 2', values: R2, kind: 'step', color: 's4', width: 1, dashed: true },
        { key: 'r1', label: 'R1 壓力 1', values: R1, kind: 'step', color: 's4', width: 1 },
        { key: 'p', label: 'P 樞軸', values: P, kind: 'step', color: 's0', width: 1 },
        { key: 's1', label: 'S1 支撐 1', values: S1, kind: 'step', color: 's3', width: 1 },
        { key: 's2', label: 'S2 支撐 2', values: S2, kind: 'step', color: 's3', width: 1, dashed: true },
      ],
    };
  },
  describe(candles, r, p) {
    const n = candles.length;
    const levels = [
      { name: 'S2', v: getLine(r, 's2')[n - 1] },
      { name: 'S1', v: getLine(r, 's1')[n - 1] },
      { name: 'P', v: getLine(r, 'p')[n - 1] },
      { name: 'R1', v: getLine(r, 'r1')[n - 1] },
      { name: 'R2', v: getLine(r, 'r2')[n - 1] },
    ].filter((x): x is { name: string; v: number } => x.v != null);
    if (levels.length === 0) return null;
    const close = candles[n - 1]!.close;
    const support = [...levels].reverse().find((l) => l.v <= close);
    const resist = levels.find((l) => l.v > close);
    const pv = levels.find((l) => l.name === 'P')!;
    return {
      tone: 'neutral',
      headline: `收盤價在樞軸 P（${fmtNum(pv.v)}）之${close >= pv.v ? '上' : '下'}`,
      detail: `依${BASIS_LABEL[p.basis] ?? ''}的高低收計算：${
        resist ? `上方最近的壓力是 ${resist.name}（${fmtNum(resist.v)}）` : '已經在所有壓力之上'
      }，${support ? `下方最近的支撐是 ${support.name}（${fmtNum(support.v)}）` : '已經跌破所有支撐'}。`,
    };
  },
  noSignalReason:
    '樞軸點是根據上一段期間的高低收，畫出「這段期間可能的支撐、壓力」，只是參考價位，本身不會產生買賣訊號。',
};
