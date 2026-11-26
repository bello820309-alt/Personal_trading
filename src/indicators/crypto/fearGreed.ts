import { fmtNum } from '../../data/format';
import { crossOver, crossUnder, scanSignals } from '../math/core';
import { afterStats, afterText, longestRun } from '../math/after';
import { getLine, notesOf, type IndicatorDef } from '../types';
import { lastValid } from '../math/core';
import { lastDate, valueOn } from '../../data/extra';
import { extraSeries, freshLast, staleSummary } from './common';

export type FearGreedParams = { buyBelow: number; sellAbove: number };

export const fearGreedIndicator: IndicatorDef<FearGreedParams> = {
  id: 'fear-greed',
  shortName: '恐懼貪婪',
  name: '恐懼貪婪指數',
  enName: 'Crypto Fear & Greed Index',
  category: 'crypto',
  placement: 'pane',
  assets: ['BTC'],
  requires: ['fng'],
  params: [
    { key: 'buyBelow', type: 'number', label: '買進門檻（跌破這個數字）', min: 5, max: 50, step: 1 },
    { key: 'sellAbove', type: 'number', label: '賣出門檻（突破這個數字）', min: 50, max: 95, step: 1 },
  ],
  defaults: { buyBelow: 25, sellAbove: 75 },
  compute(candles, p, ctx) {
    // 每天早上 8 點公布的數字對應「當天」那根日 K；那根還沒收盤時圖上畫不出來，先記下來給說明用
    const raw = ctx?.extra?.series.fng;
    const lastBar = candles[candles.length - 1];
    const newestDay = raw ? lastDate(raw) : null;
    const newestValue = raw && newestDay ? valueOn(raw, newestDay) : null;
    const newer =
      lastBar && newestDay && newestValue !== null && newestDay > (lastBar.endTime ?? lastBar.time) ? { date: newestDay, value: newestValue } : undefined;
    return {
      ...(newer ? { newer } : {}),
      dataEnd: newestDay,
      lines: [{ key: 'fng', label: '恐懼貪婪指數', values: extraSeries(ctx, 'fng', candles), kind: 'line', color: 's4', width: 2 }],
      levels: [
        { value: p.sellAbove, label: `極度貪婪 ${p.sellAbove}`, color: 'hot' },
        { value: 50, label: '50' },
        { value: p.buyBelow, label: `極度恐懼 ${p.buyBelow}`, color: 'cold' },
      ],
      scale: { min: 0, max: 100 },
    };
  },
  signals(candles, r, p) {
    const v = getLine(r, 'fng');
    return scanSignals(
      candles.length,
      (i) => crossUnder(v, p.buyBelow, i),
      (i) => crossOver(v, p.sellAbove, i),
      '跌進極度恐懼',
      '漲進極度貪婪',
    );
  },
  describe(candles, r, p) {
    const x = freshLast(getLine(r, 'fng'), candles.length);
    if (x === null) return staleSummary(getLine(r, 'fng'), candles, undefined, r.dataEnd);
    const v = fmtNum(x, 0);
    const at = lastValid(getLine(r, 'fng'));
    const when = at ? candles[at.index]?.time : undefined;
    const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
    const label = (y: number) => (y < p.buyBelow ? '極度恐懼' : y < 45 ? '恐懼' : y <= 55 ? '中性' : y <= p.sellAbove ? '貪婪' : '極度貪婪');
    const newer = r.newer
      ? `更新的數字已經公布了：${md(r.newer.date)} 早上 8 點是 ${fmtNum(r.newer.value, 0)}（${label(r.newer.value)}）。它會畫在 ${md(r.newer.date)} 那根日 K 上，那根要到隔天早上 8 點才收盤，收盤之後圖上和上面的數字才會換成新的。`
      : '';
    const note = when
      ? `這是 ${md(when)} 台灣時間早上 8 點公布的數字。它是用公布之前那一天的市場狀況算的，畫在 ${md(when)} 那根日 K 上（那根剛好從 ${md(when)} 早上 8 點開始），所以圖上每一天的數字，反映的都是「前一天」的情緒；當天的大漲大跌，要到隔天公布的數字才會反映。`
      : '';
    const dateNotes: [string, string][] = [['這個數字是哪一天的', note], ['更新的數字', newer]];
    // 過去到過這麼極端之後怎麼走：用資料算，不憑印象
    const fng = getLine(r, 'fng');
    const AFTER = 30;
    const extreme = (side: 'low' | 'high') => {
      const hit = (i: number) => { const y = fng[i]; return y != null && (side === 'low' ? y < p.buyBelow : y > p.sellAbove); };
      const what = side === 'low' ? `指數低於 ${p.buyBelow}（極度恐懼）` : `指數高於 ${p.sellAbove}（極度貪婪）`;
      return `${afterText(afterStats(candles, hit, AFTER), what, side === 'low' ? 'up' : 'down')}最久曾經連續 ${longestRun(candles.length, hit)} 天都在這個區間。`;
    };
    if (x < p.buyBelow) {
      return {
        tone: 'cold',
        headline: `恐懼貪婪指數 ${v}：極度恐懼`,
        detail: '市場一片恐慌。標籤是在描述大家的情緒，不是買賣建議：恐慌可能持續一陣子，價格也可能繼續跌。',
        notes: notesOf(['過去極度恐懼之後', extreme('low')], ...dateNotes),
      };
    }
    if (x < 45)
      return {
        tone: 'bearish',
        headline: `恐懼貪婪指數 ${v}：恐懼`,
        detail: '市場氣氛偏悲觀，大家比較小心。「偏空」是在描述大家的情緒，不是叫你先不要買。',
        notes: notesOf(['反向操作的人怎麼看', '有一種做法叫反向操作：在大家恐懼時慢慢分批買、在大家貪婪時比較小心。本站回測的就是這種規則（極度恐懼買、極度貪婪賣），成績在指標百科下面。'], ...dateNotes),
      };
    if (x <= 55) return { tone: 'neutral', headline: `恐懼貪婪指數 ${v}：中性`, detail: '市場情緒不算樂觀也不算悲觀。', notes: notesOf(...dateNotes) };
    if (x <= p.sellAbove)
      return {
        tone: 'bullish',
        headline: `恐懼貪婪指數 ${v}：貪婪`,
        detail: '市場氣氛偏樂觀，追價的人變多。「偏多」是在描述大家的情緒，不是叫你追買。',
        notes: notesOf(['反向操作的人怎麼看', '有一種做法叫反向操作：在大家恐懼時慢慢分批買、在大家貪婪時比較小心。本站回測的就是這種規則（極度恐懼買、極度貪婪賣），成績在指標百科下面。'], ...dateNotes),
      };
    return {
      tone: 'hot',
      headline: `恐懼貪婪指數 ${v}：極度貪婪`,
      detail: '市場很狂熱。標籤是在描述大家的情緒，不是買賣建議：貪婪也可能維持一陣子。',
      notes: notesOf(['過去極度貪婪之後', extreme('high')], ...dateNotes),
    };
  },
  strategy: {
    name: '跌進極度恐懼買、漲進極度貪婪賣（反向操作）',
    buyRule: '指數由上往下跌破 25（進入「極度恐懼」），隔天開盤買進。',
    sellRule: '指數由下往上突破 75（進入「極度貪婪」），隔天開盤賣出。',
  },
};
