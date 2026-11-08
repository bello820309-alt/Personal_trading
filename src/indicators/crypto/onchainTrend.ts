import { fmtCompact, fmtNum } from '../../data/format';
import type { ExtraKey } from '../../data/extra';
import { crossOver, crossUnder, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef } from '../types';
import { extraSeries, freshLast } from './common';

export type OnchainTrendParams = { fast: number; slow: number };

/** 兩條均線比較「最近」和「比較長一段時間」的鏈上活動：短的在上面代表越來越熱絡 */
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
  up: { headline: string; detail: string };
  down: { headline: string; detail: string };
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
      return diff >= 0
        ? { tone: 'bullish', headline: opts.up.headline, detail: `${v}。${opts.up.detail}` }
        : { tone: 'bearish', headline: opts.down.headline, detail: `${v}。${opts.down.detail}` };
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
  up: { headline: '算力帶：算力穩定成長', detail: '礦工持續加入、投入更多機器，網路很健康。「偏多」是指礦工沒有投降、沒有被迫賣幣的壓力，不是說價格會漲：價格下跌時算力還在成長也很常見。' },
  down: { headline: '算力帶：礦工投降中', detail: '算力下降，代表有礦工撐不下去關機了（例如幣價大跌、減半後收入減少）；歷史上常出現在階段性低點附近。' },
  strategy: {
    name: '算力短均線上穿長均線買、下穿賣',
    buyRule: '算力的 30 日平均由下往上穿越 60 日平均（礦工投降結束、算力回升），隔天開盤買進。',
    sellRule: '30 日平均由上往下跌破 60 日平均（礦工開始投降），隔天開盤賣出。',
  },
});
