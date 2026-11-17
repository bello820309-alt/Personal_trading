import { fmtCompact, fmtNum } from '../../data/format';
import type { ExtraKey } from '../../data/extra';
import { crossOver, crossUnder, scanSignals, sma } from '../math/core';
import { afterStats, afterText } from '../math/after';
import { getLine, type IndicatorDef, notesOf } from '../types';
import { extraSeries, freshLast } from './common';

export type OnchainTrendParams = { fast: number; slow: number };

/** 兩條均線比較「最近」和「比較長一段時間」的鏈上活動：短的在上面代表越來越熱絡 */
/** 某一邊（短均線在上／在下）的說明；after 有寫的話，另外算出「過去這種情況之後價格怎麼走」 */
type OnchainSide = {
  headline: string;
  detail: string;
  after?: { title: string; what: string; bars: number; side: 'up' | 'down' };
};

function onchainTrend(opts: {
  id: string;
  shortName: string;
  name: string;
  enName: string;
  key: ExtraKey;
  /** 把原始數值換成畫圖用的單位（例如算力 TH/s → EH/s） */
  scale: (x: number) => number;
  what: string;
  defaults: OnchainTrendParams;
  buyLabel: string;
  sellLabel: string;
  up: OnchainSide;
  down: OnchainSide;
  strategy: { name: string; buyRule: string; sellRule: string };
}): IndicatorDef<OnchainTrendParams> {
  return {
    id: opts.id,
    shortName: opts.shortName,
    name: opts.name,
    enName: opts.enName,
    category: 'crypto',
    placement: 'pane',
    assets: ['BTC'],
    requires: [opts.key],
    params: [
      { key: 'fast', type: 'number', label: '短均線天數', min: 3, max: 120, step: 1 },
      { key: 'slow', type: 'number', label: '長均線天數', min: 10, max: 365, step: 1 },
    ],
    defaults: opts.defaults,
    compute(candles, p, ctx) {
      const raw = extraSeries(ctx, opts.key, candles).map((x) => (x === null ? null : opts.scale(x)));
      return {
        lines: [
          { key: 'fast', label: `MA${p.fast}`, values: sma(raw, p.fast), kind: 'line', color: 'accent', width: 2 },
          { key: 'slow', label: `MA${p.slow}`, values: sma(raw, p.slow), kind: 'line', color: 'hot', width: 1 },
        ],
      };
    },
    signals(candles, r) {
      const f = getLine(r, 'fast');
      const s = getLine(r, 'slow');
      return scanSignals(candles.length, (i) => crossOver(f, s, i), (i) => crossUnder(f, s, i), opts.buyLabel, opts.sellLabel);
    },
    describe(candles, r) {
      const f = freshLast(getLine(r, 'fast'), candles.length);
      const s = freshLast(getLine(r, 'slow'), candles.length);
      if (f === null || s === null) return null;
      const diff = s > 0 ? f / s - 1 : 0;
      const v = `${opts.what}的短均線 ${fmtCompact(f)}，比長均線${diff >= 0 ? '高' : '低'} ${fmtNum(Math.abs(diff) * 100, 1)}%`;
      // 差不到 1% 時兩條線幾乎黏在一起，不要說成明顯的轉強或轉弱
      // 兩條線過去交叉幾次、幾次很快又交叉回去：用資料算，不憑印象
      const fastL = getLine(r, 'fast');
      const slowL = getLine(r, 'slow');
      const side = (i: number) => { const a = fastL[i], b = slowL[i]; return a == null || b == null ? 0 : a > b ? 1 : -1; };
      let crosses = 0;
      let backSoon = 0;
      const SOON = 10;
      for (let i = 1; i + SOON < candles.length; i++) {
        if (side(i) === 0 || side(i - 1) === 0 || side(i) === side(i - 1)) continue;
        crosses++;
        for (let j = i + 1; j <= i + SOON; j++) {
          if (side(j) !== 0 && side(j) !== side(i)) {
            backSoon++;
            break;
          }
        }
      }
      const crossNote = crosses >= 5 ? `這份資料裡兩條線交叉過 ${crosses} 次，其中 ${backSoon} 次在 ${SOON} 天內又交叉回去。回測的規則是一交叉就買賣、不管兩條線差多少，成績已經包含這些來回。` : '';
      // 差不到 1% 時兩條線幾乎黏在一起，不要說成明顯的轉強或轉弱
      if (Math.abs(diff) < 0.01) {
        return {
          tone: 'neutral',
          headline: `${opts.shortName}：短期和長期差不多`,
          detail: `${v}，差不到 1%，兩條線幾乎黏在一起，還不算明顯的變化。`,
          notes: notesOf(['差這麼小，交叉算不算', crossNote]),
        };
      }
      const after = diff >= 0 ? opts.up.after : opts.down.after;
      const stats = after
        ? afterText(afterStats(candles, (i) => side(i) === (diff >= 0 ? 1 : -1), after.bars), after.what, after.side)
        : '';
      return diff >= 0
        ? { tone: 'bullish', headline: opts.up.headline, detail: `${v}。${opts.up.detail}`, notes: notesOf([opts.up.after?.title ?? '', stats], ['兩條線交叉過幾次', crossNote]) }
        : { tone: 'bearish', headline: opts.down.headline, detail: `${v}。${opts.down.detail}`, notes: notesOf([opts.down.after?.title ?? '', stats], ['兩條線交叉過幾次', crossNote]) };
    },
    strategy: opts.strategy,
  };
}

export const activeAddressesIndicator = onchainTrend({
  id: 'active-addresses',
  shortName: '活躍地址',
  name: '活躍地址數',
  enName: 'Active Addresses',
  key: 'activeAddresses',
  scale: (x) => x,
  what: '活躍地址數',
  defaults: { fast: 30, slow: 90 },
  buyLabel: '使用人數轉強',
  sellLabel: '使用人數轉弱',
  up: { headline: '活躍地址：使用的人越來越多', detail: '最近一個月比前三個月熱絡，代表有更多人在使用比特幣網路。' },
  down: { headline: '活躍地址：使用的人變少', detail: '最近一個月比前三個月冷清，市場參與度下降。' },
  strategy: {
    name: '活躍地址短均線上穿長均線買、下穿賣',
    buyRule: '活躍地址數的 30 日平均由下往上穿越 90 日平均（使用的人變多），隔天開盤買進。',
    sellRule: '30 日平均由上往下跌破 90 日平均（使用的人變少），隔天開盤賣出。',
  },
});

export const hashRibbonsIndicator = onchainTrend({
  id: 'hash-ribbons',
  shortName: '算力帶',
  name: '算力帶（Hash Ribbons）',
  enName: 'Hash Ribbons',
  key: 'hashRate',
  scale: (x) => x / 1e6, // TH/s → EH/s
  what: '算力（EH/s）',
  defaults: { fast: 30, slow: 60 },
  buyLabel: '礦工投降結束',
  sellLabel: '礦工投降',
  up: { headline: '算力帶：算力穩定成長', detail: '礦工持續加入、投入更多機器。「偏多」是指礦工沒有投降、沒有被迫賣幣的壓力，不是說價格會漲：價格下跌時，算力也可能還在成長。' },
  down: {
    headline: '算力帶：礦工投降中',
    detail: '算力下降，代表有礦工撐不下去關機了（例如幣價大跌、減半後收入減少）。',
    after: { title: '過去礦工投降期間之後', what: '算力短均線在長均線之下（礦工投降）', bars: 90, side: 'up' },
  },
  strategy: {
    name: '算力短均線上穿長均線買、下穿賣',
    buyRule: '算力的 30 日平均由下往上穿越 60 日平均（礦工投降結束、算力回升），隔天開盤買進。',
    sellRule: '30 日平均由上往下跌破 60 日平均（礦工開始投降），隔天開盤賣出。',
  },
});
