import { fmtNum } from '../../data/format';
import { atrWilder, closes, crossOver, crossUnder, ema, scanSignals, zip } from '../math/core';
import { getLine, type IndicatorDef } from '../types';

export type KeltnerParams = { emaPeriod: number; atrPeriod: number; mult: number };

export const keltnerIndicator: IndicatorDef<KeltnerParams> = {
  id: 'keltner',
  shortName: 'KC',
  name: '肯特納通道',
  enName: 'Keltner Channel',
  category: 'volatility',
  placement: 'overlay',
  params: [
    { key: 'emaPeriod', type: 'number', label: '中線 EMA 天數', min: 5, max: 100, step: 1 },
    { key: 'atrPeriod', type: 'number', label: 'ATR 天數', min: 2, max: 60, step: 1 },
    { key: 'mult', type: 'number', label: 'ATR 倍數', min: 0.5, max: 5, step: 0.1 },
  ],
  defaults: { emaPeriod: 20, atrPeriod: 10, mult: 2 },
  compute(candles, p) {
    const mid = ema(closes(candles), p.emaPeriod);
    const atr = atrWilder(candles, p.atrPeriod);
    return {
      lines: [
        { key: 'upper', label: '上軌', values: zip(mid, atr, (m, a) => m + p.mult * a), kind: 'line', color: 's3', width: 1 },
        { key: 'middle', label: `中線（EMA${p.emaPeriod}）`, values: mid, kind: 'line', color: 's3', width: 1, dashed: true },
        { key: 'lower', label: '下軌', values: zip(mid, atr, (m, a) => m - p.mult * a), kind: 'line', color: 's3', width: 1 },
      ],
      fills: [{ upper: 'upper', lower: 'lower', color: 's3', opacity: 0.06 }],
    };
  },
  signals(candles, r) {
    const close = closes(candles);
    return scanSignals(
      candles.length,
      (i) => crossOver(close, getLine(r, 'upper'), i),
      (i) => crossUnder(close, getLine(r, 'middle'), i),
      '突破上軌',
      '跌破中線',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const u = getLine(r, 'upper')[n - 1];
    const m = getLine(r, 'middle')[n - 1];
    const l = getLine(r, 'lower')[n - 1];
    if (u == null || m == null || l == null) return null;
    const c = candles[n - 1]!.close;
    // 擠壓：布林通道（20 日、2 倍標準差）整個縮進肯特納通道裡
    let squeezeNote = '';
    if (n >= 20) {
      const xs = candles.slice(n - 20).map((k) => k.close);
      const mean = xs.reduce((a, x) => a + x, 0) / 20;
      const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / 20);
      const bu = mean + 2 * sd;
      const bl = mean - 2 * sd;
      squeezeNote =
        bu < u && bl > l
          ? ` 布林通道（${fmtNum(bl)}～${fmtNum(bu)}）整個縮在肯特納通道裡，就是「擠壓」：波動變得很小，常常是大行情發動前的醞釀。`
          : ` 布林通道（${fmtNum(bl)}～${fmtNum(bu)}）沒有縮進肯特納通道裡，現在沒有「擠壓」。`;
    }
    if (c > u) return { tone: 'bullish', headline: '收盤價突破上軌', detail: `上軌 ${fmtNum(u)}：價格衝出通道，代表趨勢很強。${squeezeNote}` };
    if (c < l) return { tone: 'bearish', headline: '收盤價跌破下軌', detail: `下軌 ${fmtNum(l)}：價格跌出通道，代表跌勢很強。${squeezeNote}` };
    return c >= m
      ? { tone: 'bullish', headline: '在中線與上軌之間', detail: `通道 ${fmtNum(l)}～${fmtNum(u)}，價格在中線（${fmtNum(m)}）之上。${squeezeNote}` }
      : { tone: 'bearish', headline: '在中線與下軌之間', detail: `通道 ${fmtNum(l)}～${fmtNum(u)}，價格在中線（${fmtNum(m)}）之下。${squeezeNote}` };
  },
  strategy: {
    name: '突破上軌買、跌破中線賣（順勢）',
    buyRule: '收盤價由下往上突破肯特納通道上軌，隔天開盤買進。',
    sellRule: '收盤價由上往下跌破中線（EMA），隔天開盤賣出。',
  },
};
