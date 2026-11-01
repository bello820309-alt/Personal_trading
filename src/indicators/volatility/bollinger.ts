import { fmtNum } from '../../data/format';
import { closes, crossOver, scanSignals, sma, stdev, validSlice, zip } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type BollingerParams = { period: number; mult: number };

export const bollingerIndicator: IndicatorDef<BollingerParams> = {
  id: 'bollinger',
  shortName: 'BB',
  name: '布林通道',
  enName: 'Bollinger Bands',
  category: 'volatility',
  placement: 'overlay',
  params: [
    { key: 'period', type: 'number', label: '均線天數', min: 5, max: 100, step: 1 },
    { key: 'mult', type: 'number', label: '標準差倍數', min: 0.5, max: 4, step: 0.1 },
  ],
  defaults: { period: 20, mult: 2 },
  compute(candles, p) {
    const close = closes(candles);
    const mid = sma(close, p.period);
    const sd = stdev(close, p.period);
    const upper = zip(mid, sd, (m, s) => m + p.mult * s);
    const lower = zip(mid, sd, (m, s) => m - p.mult * s);
    const pctB: Series = close.map((c, i) => {
      const u = upper[i];
      const l = lower[i];
      if (c === null || u == null || l == null || u === l) return null;
      return (c - l) / (u - l);
    });
    const width: Series = mid.map((m, i) => {
      const u = upper[i];
      const l = lower[i];
      return m == null || u == null || l == null || m === 0 ? null : ((u - l) / m) * 100;
    });
    return {
      lines: [
        { key: 'upper', label: '上軌', values: upper, kind: 'line', color: 's1', width: 1 },
        { key: 'middle', label: `中軌（${p.period} 日均線）`, values: mid, kind: 'line', color: 's0', width: 1, dashed: true },
        { key: 'lower', label: '下軌', values: lower, kind: 'line', color: 's1', width: 1 },
        { key: 'pctB', label: '%B', values: pctB, kind: 'line', color: 'muted', hidden: true },
        { key: 'width', label: '帶寬 %', values: width, kind: 'line', color: 'muted', hidden: true, unit: 'percent' },
      ],
      fills: [{ upper: 'upper', lower: 'lower', color: 's1', opacity: 0.07 }],
    };
  },
  signals(candles, r) {
    const close = closes(candles);
    const lower = getLine(r, 'lower');
    const mid = getLine(r, 'middle');
    const below = (i: number) => {
      const l = lower[i];
      return l != null && (close[i] as number) < l;
    };
    return scanSignals(
      candles.length,
      (i) => below(i) && !below(i - 1),
      (i) => crossOver(close, mid, i),
      '跌破下軌',
      '回到中軌',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const b = getLine(r, 'pctB')[n - 1];
    const widthLine = getLine(r, 'width');
    const w = widthLine[n - 1];
    if (b == null || w == null) return null;
    const recent = validSlice(widthLine, n - 120, n);
    const squeeze = recent.length >= 60 && w <= Math.min(...recent) * 1.05;
    const sq = squeeze ? ' 通道寬度接近半年來最窄（「擠壓」），常常是大行情前的醞釀期。' : '';
    const head = `%B = ${fmtNum(b, 2)}`;
    if (b > 1) return { tone: 'hot', headline: `${head}，突破上軌`, detail: `收盤價在上軌之上：走勢很強，但也偏離平均很多。${sq}` };
    if (b < 0) return { tone: 'cold', headline: `${head}，跌破下軌`, detail: `收盤價在下軌之下：跌勢很急，常被視為超跌。${sq}` };
    return b >= 0.5
      ? { tone: 'bullish', headline: `${head}，在中軌之上`, detail: `收盤價在通道的上半部（1 = 上軌、0 = 下軌）。${sq}` }
      : { tone: 'bearish', headline: `${head}，在中軌之下`, detail: `收盤價在通道的下半部（1 = 上軌、0 = 下軌）。${sq}` };
  },
  strategy: {
    name: '跌破下軌買、回到中軌賣（逆勢）',
    buyRule: '收盤價跌破布林通道下軌（偏離平均很多），隔天開盤買進。',
    sellRule: '收盤價回到中軌（20 日均線）之上，隔天開盤賣出。',
  },
};
