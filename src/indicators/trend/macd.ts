import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, ema, scanSignals, zip } from '../math/core';
import { getLine, type IndicatorDef } from '../types';

export type MacdParams = { fast: number; slow: number; signal: number; source: string };

export const macdIndicator: IndicatorDef<MacdParams> = {
  id: 'macd',
  shortName: 'MACD',
  name: '指數平滑異同移動平均線',
  enName: 'Moving Average Convergence Divergence',
  category: 'trend',
  placement: 'pane',
  params: [
    { key: 'fast', type: 'number', label: '快線 EMA 天數', min: 2, max: 60, step: 1 },
    { key: 'slow', type: 'number', label: '慢線 EMA 天數', min: 3, max: 120, step: 1 },
    { key: 'signal', type: 'number', label: '訊號線天數', min: 2, max: 60, step: 1 },
    {
      key: 'source',
      type: 'select',
      label: '計算用的價格',
      options: [
        { value: 'close', label: '收盤價（國際常用）' },
        { value: 'di', label: 'DI＝(高＋低＋2×收)÷4（台灣傳統算法）' },
      ],
      help: '不同看盤軟體的 MACD 數值略有差異，常常就是因為這個設定不同。',
    },
  ],
  defaults: { fast: 12, slow: 26, signal: 9, source: 'close' },
  compute(candles, p) {
    const src = p.source === 'di' ? candles.map((c) => (c.high + c.low + 2 * c.close) / 4) : closes(candles);
    const dif = zip(ema(src, p.fast), ema(src, p.slow), (a, b) => a - b);
    const sig = ema(dif, p.signal);
    const osc = zip(dif, sig, (a, b) => a - b);
    return {
      lines: [
        {
          key: 'osc',
          label: 'OSC（柱狀體）',
          values: osc,
          kind: 'histogram',
          color: 'up',
          colors: osc.map((v) => (v === null ? null : v >= 0 ? 'up' : 'down')),
        },
        { key: 'dif', label: 'DIF（快線）', values: dif, kind: 'line', color: 's1', width: 2 },
        { key: 'macd', label: 'MACD（訊號線）', values: sig, kind: 'line', color: 's0', width: 2 },
      ],
      levels: [{ value: 0, label: '0 軸' }],
      // 柱狀體要先畫（才不會蓋住線），但說明時先講 DIF、訊號線，再講柱狀體比較好懂
      legendOrder: ['dif', 'macd', 'osc'],
    };
  },
  signals(candles, r) {
    const dif = getLine(r, 'dif');
    const sig = getLine(r, 'macd');
    return scanSignals(
      candles.length,
      (i) => crossOver(dif, sig, i),
      (i) => crossUnder(dif, sig, i),
      'MACD 黃金交叉',
      'MACD 死亡交叉',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const dif = getLine(r, 'dif')[n - 1];
    const sig = getLine(r, 'macd')[n - 1];
    const osc = getLine(r, 'osc');
    const o1 = osc[n - 1];
    const o0 = osc[n - 2];
    if (dif == null || sig == null || o1 == null) return null;
    const above = dif > sig;
    const positive = dif > 0;
    let tone: 'bullish' | 'bearish' | 'neutral';
    let text: string;
    if (above && positive) {
      tone = 'bullish';
      text = 'DIF 在訊號線之上、也在 0 軸之上：多方動能占優勢。';
    } else if (above && !positive) {
      tone = 'neutral';
      text = 'DIF 在訊號線之上但仍在 0 軸之下：跌勢可能趨緩，但還沒轉成多頭。';
    } else if (!above && positive) {
      tone = 'neutral';
      text = 'DIF 在訊號線之下但仍在 0 軸之上：漲勢的力道在減弱。';
    } else {
      tone = 'bearish';
      text = 'DIF 在訊號線之下、也在 0 軸之下：空方動能占優勢。';
    }
    const growth =
      o0 == null ? '' : Math.abs(o1) > Math.abs(o0) ? '，而且正在放大（動能增強中）' : '，而且正在縮小（動能減弱中）';
    return {
      tone,
      headline: `DIF ${fmtNum(dif)}／MACD ${fmtNum(sig)}`,
      detail: `${text}柱狀體（OSC）目前為${o1 >= 0 ? '正值' : '負值'}${growth}。（DIF 是短期和長期均線的差距，訊號線是 DIF 的平均，柱狀體是兩者相減；0 軸代表短期和長期均線一樣高。）`,
    };
  },
  strategy: {
    name: 'MACD 黃金交叉買、死亡交叉賣',
    buyRule: 'DIF 由下往上穿越訊號線（MACD 黃金交叉），隔天開盤買進。',
    sellRule: 'DIF 由上往下跌破訊號線（MACD 死亡交叉），隔天開盤賣出。',
  },
};
