import { fmtNum, fmtPct } from '../../data/format';
import { nulls, rma, scanSignals } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type SuperTrendParams = { atrPeriod: number; multiplier: number };

export const supertrendIndicator: IndicatorDef<SuperTrendParams> = {
  id: 'supertrend',
  shortName: 'SuperTrend',
  name: '超級趨勢',
  enName: 'SuperTrend',
  category: 'trend',
  placement: 'overlay',
  params: [
    { key: 'atrPeriod', type: 'number', label: 'ATR 天數', min: 2, max: 60, step: 1 },
    {
      key: 'multiplier',
      type: 'number',
      label: 'ATR 倍數',
      min: 0.5,
      max: 10,
      step: 0.1,
      help: '倍數越大，線離價格越遠，越不容易翻轉（訊號少但較穩）。',
    },
  ],
  defaults: { atrPeriod: 10, multiplier: 3 },
  compute(candles, p) {
    const n = candles.length;
    // TradingView 的算法：第一根的 TR = 高 − 低
    const tr: Series = candles.map((c, i) =>
      i === 0
        ? c.high - c.low
        : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1]!.close), Math.abs(c.low - candles[i - 1]!.close)),
    );
    const atr = rma(tr, p.atrPeriod);
    const upLine = nulls(n);
    const downLine = nulls(n);
    const trend = nulls(n);
    let fu = 0;
    let fl = 0;
    let dir = -1;
    let started = false;
    for (let i = 0; i < n; i++) {
      const a = atr[i];
      if (a == null) continue;
      const c = candles[i]!;
      const hl2 = (c.high + c.low) / 2;
      const bu = hl2 + p.multiplier * a;
      const bl = hl2 - p.multiplier * a;
      if (!started) {
        fu = bu;
        fl = bl;
        dir = -1;
        started = true;
      } else {
        const prevClose = candles[i - 1]!.close;
        const prevFu = fu;
        const prevFl = fl;
        fu = bu < prevFu || prevClose > prevFu ? bu : prevFu;
        fl = bl > prevFl || prevClose < prevFl ? bl : prevFl;
        dir = dir === -1 ? (c.close > fu ? 1 : -1) : c.close < fl ? -1 : 1;
      }
      trend[i] = dir;
      if (dir === 1) upLine[i] = fl;
      else downLine[i] = fu;
    }
    return {
      lines: [
        { key: 'up', label: 'SuperTrend（多方支撐）', values: upLine, kind: 'line', color: 'up', width: 2 },
        { key: 'down', label: 'SuperTrend（空方壓力）', values: downLine, kind: 'line', color: 'down', width: 2 },
        { key: 'trend', label: '方向', values: trend, kind: 'line', color: 'muted', hidden: true },
      ],
    };
  },
  signals(candles, r) {
    const t = getLine(r, 'trend');
    return scanSignals(
      candles.length,
      (i) => t[i - 1] === -1 && t[i] === 1,
      (i) => t[i - 1] === 1 && t[i] === -1,
      'SuperTrend 翻多',
      'SuperTrend 翻空',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const t = getLine(r, 'trend')[n - 1];
    if (t == null) return null;
    const up = t > 0;
    const v = up ? getLine(r, 'up')[n - 1] : getLine(r, 'down')[n - 1];
    if (v == null) return null;
    const close = candles[n - 1]!.close;
    // 從哪一天開始是這個方向
    const tr = getLine(r, 'trend');
    let from = n - 1;
    while (from > 0 && tr[from - 1] === t) from--;
    const days = n - from;
    const md = `${Number(candles[from]!.time.slice(5, 7))}/${Number(candles[from]!.time.slice(8, 10))}`;
    const since = from > 0 ? ` ${md} 翻${up ? '多' : '空'}，到今天是第 ${days} 根 K 棒${days <= 2 ? '，還沒經過 2～3 天的確認' : ''}。` : '';
    return {
      tone: up ? 'bullish' : 'bearish',
      headline: up ? 'SuperTrend 多方（線在價格下方）' : 'SuperTrend 空方（線在價格上方）',
      detail: `${up ? '支撐' : '壓力'}線在 ${fmtNum(v)}，距離收盤價 ${fmtPct(v / close - 1)}。${
        up ? '收盤跌破這條線才會翻空。' : '收盤漲過這條線才會翻多。'
      }${since}`,
    };
  },
  strategy: {
    name: 'SuperTrend 翻多買、翻空賣',
    buyRule: '收盤價漲過 SuperTrend 壓力線、轉為多方，隔天開盤買進。',
    sellRule: '收盤價跌破 SuperTrend 支撐線、轉為空方，隔天開盤賣出。',
  },
};
