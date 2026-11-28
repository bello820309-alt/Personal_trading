import { fmtMd, fmtNum, fmtPct } from '../../data/format';
import { nulls, rma, scanSignals } from '../math/core';
import { getLine, notesOf, type IndicatorDef, type Series } from '../types';

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
        { key: 'up', label: 'SuperTrend 多方支撐線', values: upLine, kind: 'line', color: 'up', width: 2 },
        { key: 'down', label: 'SuperTrend 空方壓力線', values: downLine, kind: 'line', color: 'down', width: 2 },
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
    const md = fmtMd(candles[from]!.time, candles[candles.length - 1]!.time);
    const confirm =
      days <= 2
        ? '，還沒經過有些人用的「連續 2～3 天才算」確認'
        : '，已經超過有些人用的「連續 2～3 天才算」（本站的回測和箭頭是翻轉當天就算，隔天開盤買賣，不另外等確認）';
    // 翻轉之後價格反而往另一邊走：線還沒被碰到就不會翻回來
    const flipClose = candles[from]!.close;
    const move = close / flipClose - 1;
    let against = '';
    if (from > 0 && ((up && move <= -0.02) || (!up && move >= 0.02))) {
      const entry = from + 1 <= n - 1 ? candles[from + 1]! : null;
      const pnl = entry ? close / entry.open - 1 : null;
      const trade =
        entry && pnl !== null
          ? `照回測的規則在翻${up ? '多' : '空'}隔天開盤（${fmtMd(entry.time, candles[candles.length - 1]!.time)} 的 ${fmtNum(entry.open)}）${up ? '買進' : '賣出'}的話，到今天${up ? (pnl < 0 ? `虧 ${fmtNum(-pnl * 100, 2)}%` : `賺 ${fmtNum(pnl * 100, 2)}%`) : pnl > 0 ? `賣掉之後又漲了 ${fmtNum(pnl * 100, 2)}%` : `賣掉之後跌了 ${fmtNum(-pnl * 100, 2)}%`}，要等收盤${up ? '跌破' : '漲過'}線才會${up ? '賣出' : '買回'}。`
          : '';
      against = `翻${up ? '多' : '空'}那天收盤 ${fmtNum(flipClose)}，到今天反而${up ? '跌' : '漲'}了 ${fmtNum(Math.abs(move) * 100, 2)}%，但收盤還沒${up ? '跌破支撐線' : '漲過壓力線'}，所以還是${up ? '多' : '空'}方：SuperTrend 只有收盤${up ? '跌破' : '漲過'}這條線才會翻轉。${trade}這是 SuperTrend 用「倍數 × ATR」和價格保持距離的代價：倍數越大越不容易被洗出場，但碰到線之前${up ? '回吐' : '錯過'}的也越多；倍數小一點會比較早翻轉，但盤整時也比較容易被洗出場。`;
    }
    const since = from > 0 ? `${md} 翻${up ? '多' : '空'}，到今天是第 ${days} 根 K 棒${confirm}。` : '';
    return {
      tone: up ? 'bullish' : 'bearish',
      headline: up ? 'SuperTrend 多方（線在價格下方）' : 'SuperTrend 空方（線在價格上方）',
      detail: `${up ? '支撐' : '壓力'}線在 ${fmtNum(v)}，距離收盤價 ${fmtPct(v / close - 1)}。${
        up ? '收盤跌破這條線才會翻空。' : '收盤漲過這條線才會翻多。'
      }${from > 0 ? `${md} 翻${up ? '多' : '空'}，到今天第 ${days} 根 K 棒。` : ''}`,
      notes: notesOf([`翻${up ? '多' : '空'}幾天了、算不算確認`, since], [`翻${up ? '多' : '空'}之後反而${up ? '跌' : '漲'}，為什麼還是${up ? '多' : '空'}方`, against]),
    };
  },
  strategy: {
    name: 'SuperTrend 翻多買、翻空賣',
    buyRule: '收盤價漲過 SuperTrend 壓力線、轉為多方，隔天開盤買進。',
    sellRule: '收盤價跌破 SuperTrend 支撐線、轉為空方，隔天開盤賣出。',
  },
};
