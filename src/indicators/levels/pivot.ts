import { fmtNum } from '../../data/format';
import { monthKey, weekKey, yearKey } from '../../data/resample';
import { nulls } from '../math/core';
import { getLine, type IndicatorDef, notesOf } from '../types';

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
    // 支撐（S）跌破之後在價格上方，就當成壓力看；壓力（R）突破之後在下方，就當成支撐看
    const role = (l: { name: string }, as: '壓力' | '支撐') =>
      (as === '壓力' && l.name.startsWith('S')) || (as === '支撐' && l.name.startsWith('R'))
        ? `（原本叫${as === '壓力' ? '支撐' : '壓力'}，價格${as === '壓力' ? '跌破' : '突破'}之後它在${as === '壓力' ? '上' : '下'}方；照「${as === '壓力' ? '支撐跌破變壓力' : '壓力突破變支撐'}」的說法把它當成${as}看，這個說法本站沒有驗證過）`
        : '';
    const beyond = !support
      ? '樞軸點只算到 S2，價格已經在所有支撐之下，樞軸點沒有更下面的價位可以參考；可以改看其他工具，例如前波低點、費波那契的價位。'
      : !resist
        ? '樞軸點只算到 R2，價格已經在所有壓力之上，樞軸點沒有更上面的價位可以參考。'
        : '';
    // 「上個月」是哪個月、什麼時候換：找出最後一根 K 棒那一期的前一期
    const keyFn = p.basis === 'week' ? weekKey : p.basis === 'year' ? yearKey : monthKey;
    const curKey = keyFn(candles[n - 1]!.time);
    let j = n - 1;
    while (j >= 0 && keyFn(candles[j]!.time) === curKey) j--;
    let periodNote = '';
    let periodName = '';
    if (j >= 0) {
      const prevKey = keyFn(candles[j]!.time);
      let k = j;
      while (k > 0 && keyFn(candles[k - 1]!.time) === prevKey) k--;
      const seg = candles.slice(k, j + 1);
      const hi = Math.max(...seg.map((c) => c.high));
      const lo = Math.min(...seg.map((c) => c.low));
      const md = (t: string) => `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))}`;
      const first = candles[k]!.time;
      const last = candles[j]!.time;
      periodName =
        p.basis === 'year' ? `${first.slice(0, 4)} 年` : p.basis === 'week' ? `${md(first)}～${md(last)} 那一週` : `${Number(first.slice(5, 7))} 月`;
      const curMonth = Number(candles[n - 1]!.time.slice(5, 7));
      const nextWhen =
        p.basis === 'year' ? '等明年的第一根 K 棒出來' : p.basis === 'week' ? '等下一週的第一根 K 棒出來' : `等 ${(curMonth % 12) + 1} 月的第一根 K 棒出來`;
      const curName = p.basis === 'year' ? '今年' : p.basis === 'week' ? '這一週' : `${curMonth} 月`;
      periodNote = `「${BASIS_LABEL[p.basis]}」指的是 ${periodName}（${md(first)}～${md(last)}：最高 ${fmtNum(hi)}、最低 ${fmtNum(lo)}、收盤 ${fmtNum(candles[j]!.close)}）。${curName}${p.basis === 'week' ? '' : '一整'}${p.basis === 'year' ? '年' : p.basis === 'week' ? '都' : '個月'}${p.basis === 'week' ? '' : '都'}用這組價位，${nextWhen}，就會換成用 ${curName}的高低收計算。`;
    }
    return {
      tone: 'neutral',
      headline: `收盤價在樞軸 P（${fmtNum(pv.v)}）之${close >= pv.v ? '上' : '下'}`,
      detail: `依${BASIS_LABEL[p.basis] ?? ''}${periodName ? `（${periodName}）` : ''}的高低收計算：${
        resist ? `上方最近的壓力是 ${resist.name}（${fmtNum(resist.v)}）${role(resist, '壓力')}` : '已經在所有壓力之上'
      }，${support ? `下方最近的支撐是 ${support.name}（${fmtNum(support.v)}）${role(support, '支撐')}` : '已經跌破所有支撐'}。`,
      notes: notesOf(['用哪一段的價格算', periodNote], ['再往下（往上）看哪裡', beyond]),
    };
  },
  noSignalReason:
    '樞軸點是根據上一段期間的高低收，畫出「這段期間可能的支撐、壓力」，只是參考價位，本身不會產生買賣訊號。',
};
