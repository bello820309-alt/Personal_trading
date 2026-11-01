import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, highest, highs, lowest, lows, nulls, scanSignals, zip } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type IchimokuParams = { tenkan: number; kijun: number; senkouB: number; displacement: number };

/** 雲層（先行帶）往未來平移的 K 棒數：日本慣例「含當天算第 26 根」→ 平移 25 根（與 TradingView 相同） */
export function ichimokuShift(p: IchimokuParams): number {
  return Math.max(1, Math.floor(p.displacement) - 1);
}

/** 第 i 根 K 棒「當下看到的雲層」上緣與下緣（只用過去資料計算） */
export function cloudAt(spanA: Series, spanB: Series, shift: number): { top: Series; bottom: Series } {
  const n = spanA.length;
  const top = nulls(n);
  const bottom = nulls(n);
  for (let i = shift; i < n; i++) {
    const a = spanA[i - shift];
    const b = spanB[i - shift];
    if (a == null || b == null) continue;
    top[i] = Math.max(a, b);
    bottom[i] = Math.min(a, b);
  }
  return { top, bottom };
}

export const ichimokuIndicator: IndicatorDef<IchimokuParams> = {
  id: 'ichimoku',
  shortName: '一目均衡表',
  name: '一目均衡表',
  enName: 'Ichimoku Kinko Hyo',
  category: 'trend',
  placement: 'overlay',
  params: [
    { key: 'tenkan', type: 'number', label: '轉換線天數', min: 2, max: 60, step: 1 },
    { key: 'kijun', type: 'number', label: '基準線天數', min: 5, max: 120, step: 1 },
    { key: 'senkouB', type: 'number', label: '先行帶 B 天數', min: 10, max: 240, step: 1 },
    { key: 'displacement', type: 'number', label: '平移天數', min: 2, max: 120, step: 1 },
  ],
  defaults: { tenkan: 9, kijun: 26, senkouB: 52, displacement: 26 },
  presets: [
    { label: '標準 9/26/52', values: { tenkan: 9, kijun: 26, senkouB: 52, displacement: 26 } },
    { label: '幣圈常見 20/60/120', values: { tenkan: 20, kijun: 60, senkouB: 120, displacement: 30 } },
  ],
  compute(candles, p) {
    const hi = highs(candles);
    const lo = lows(candles);
    const mid = (period: number) => zip(highest(hi, period), lowest(lo, period), (a, b) => (a + b) / 2);
    const tenkan = mid(p.tenkan);
    const kijun = mid(p.kijun);
    const spanA = zip(tenkan, kijun, (a, b) => (a + b) / 2);
    const spanB = mid(p.senkouB);
    const shift = ichimokuShift(p);
    return {
      lines: [
        { key: 'tenkan', label: '轉換線', values: tenkan, kind: 'line', color: 's1', width: 1 },
        { key: 'kijun', label: '基準線', values: kijun, kind: 'line', color: 's0', width: 1 },
        { key: 'spanA', label: '先行帶 A', values: spanA, kind: 'line', color: 'up', width: 1, shift },
        { key: 'spanB', label: '先行帶 B', values: spanB, kind: 'line', color: 'down', width: 1, shift },
        { key: 'chikou', label: '遲行線', values: closes(candles), kind: 'line', color: 's2', width: 1, shift: -shift },
      ],
      fills: [{ upper: 'spanA', lower: 'spanB', color: 'up', colorWhenInverted: 'down', opacity: 0.14 }],
    };
  },
  signals(candles, r, p) {
    const close = closes(candles);
    const { top, bottom } = cloudAt(getLine(r, 'spanA'), getLine(r, 'spanB'), ichimokuShift(p));
    return scanSignals(
      candles.length,
      (i) => crossOver(close, top, i),
      (i) => crossUnder(close, bottom, i),
      '突破雲層',
      '跌破雲層',
    );
  },
  describe(candles, r, p) {
    const n = candles.length;
    const shift = ichimokuShift(p);
    const spanA = getLine(r, 'spanA');
    const spanB = getLine(r, 'spanB');
    const { top, bottom } = cloudAt(spanA, spanB, shift);
    const t = top[n - 1];
    const b = bottom[n - 1];
    const tenkan = getLine(r, 'tenkan')[n - 1];
    const kijun = getLine(r, 'kijun')[n - 1];
    if (t == null || b == null || tenkan == null || kijun == null) return null;
    const close = candles[n - 1]!.close;
    const pos = close > t ? 'above' : close < b ? 'below' : 'inside';
    const futureA = spanA[n - 1];
    const futureB = spanB[n - 1];
    const future =
      futureA != null && futureB != null
        ? futureA >= futureB
          ? '前方的雲層是多方雲（先行帶 A 在上）。'
          : '前方的雲層是空方雲（先行帶 B 在上）。'
        : '';
    const tk = tenkan > kijun ? '轉換線在基準線之上（短線偏強）' : '轉換線在基準線之下（短線偏弱）';
    return {
      tone: pos === 'above' ? 'bullish' : pos === 'below' ? 'bearish' : 'neutral',
      headline: pos === 'above' ? '價格在雲層之上' : pos === 'below' ? '價格在雲層之下' : '價格在雲層裡（方向不明）',
      detail: `雲層範圍 ${fmtNum(b)}～${fmtNum(t)}；${tk}。${future}`,
    };
  },
  strategy: {
    name: '突破雲層買、跌破雲層賣',
    buyRule: '收盤價由下往上突破雲層上緣，隔天開盤買進。',
    sellRule: '收盤價由上往下跌破雲層下緣，隔天開盤賣出。',
  },
};
