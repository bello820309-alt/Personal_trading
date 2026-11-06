import { fmtNum } from '../../data/format';
import { crossOver, nulls, rma, scanSignals, trueRange } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type DmiParams = { period: number; adxThreshold: number };

export const dmiIndicator: IndicatorDef<DmiParams> = {
  id: 'dmi',
  shortName: 'DMI',
  name: '趨向指標（DMI／ADX）',
  enName: 'Directional Movement Index / Average Directional Index',
  category: 'trend',
  placement: 'pane',
  params: [
    { key: 'period', type: 'number', label: '天數', min: 2, max: 60, step: 1 },
    {
      key: 'adxThreshold',
      type: 'number',
      label: 'ADX 門檻',
      min: 0,
      max: 50,
      step: 1,
      help: 'ADX 高於這個值才算「有趨勢」，買進訊號才成立；設 0 代表不過濾。',
    },
  ],
  defaults: { period: 14, adxThreshold: 20 },
  compute(candles, p) {
    const n = candles.length;
    const plusDM = nulls(n);
    const minusDM = nulls(n);
    for (let i = 1; i < n; i++) {
      const up = candles[i]!.high - candles[i - 1]!.high;
      const down = candles[i - 1]!.low - candles[i]!.low;
      plusDM[i] = up > down && up > 0 ? up : 0;
      minusDM[i] = down > up && down > 0 ? down : 0;
    }
    const sTR = rma(trueRange(candles), p.period);
    const sPlus = rma(plusDM, p.period);
    const sMinus = rma(minusDM, p.period);
    const pdi: Series = nulls(n);
    const mdi: Series = nulls(n);
    const dx: Series = nulls(n);
    for (let i = 0; i < n; i++) {
      const tr = sTR[i];
      const sp = sPlus[i];
      const sm = sMinus[i];
      if (tr == null || sp == null || sm == null) continue;
      const pv = tr > 0 ? (100 * sp) / tr : 0;
      const mv = tr > 0 ? (100 * sm) / tr : 0;
      pdi[i] = pv;
      mdi[i] = mv;
      dx[i] = pv + mv > 0 ? (100 * Math.abs(pv - mv)) / (pv + mv) : 0;
    }
    const adx = rma(dx, p.period);
    return {
      lines: [
        { key: 'pdi', label: '+DI（上漲力道）', values: pdi, kind: 'line', color: 'up', width: 1 },
        { key: 'mdi', label: '−DI（下跌力道）', values: mdi, kind: 'line', color: 'down', width: 1 },
        { key: 'adx', label: 'ADX（趨勢強度）', values: adx, kind: 'line', color: 'hot', width: 2 },
      ],
      levels: p.adxThreshold > 0 ? [{ value: p.adxThreshold, label: `ADX ${p.adxThreshold}` }] : [],
    };
  },
  signals(candles, r, p) {
    const pdi = getLine(r, 'pdi');
    const mdi = getLine(r, 'mdi');
    const adx = getLine(r, 'adx');
    return scanSignals(
      candles.length,
      (i) => crossOver(pdi, mdi, i) && (p.adxThreshold <= 0 || (adx[i] ?? 0) >= p.adxThreshold),
      (i) => crossOver(mdi, pdi, i),
      '+DI 上穿 −DI',
      '−DI 上穿 +DI',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const pdi = getLine(r, 'pdi')[n - 1];
    const mdi = getLine(r, 'mdi')[n - 1];
    const adx = getLine(r, 'adx')[n - 1];
    if (pdi == null || mdi == null || adx == null) return null;
    const strength =
      adx < 20 ? '趨勢不明顯（盤整）' : adx < 25 ? '趨勢正在形成' : adx < 40 ? '趨勢明確' : '趨勢非常強';
    const up = pdi > mdi;
    return {
      tone: adx < 20 ? 'neutral' : up ? 'bullish' : 'bearish',
      headline: `ADX ${fmtNum(adx, 1)}：${strength}`,
      detail: `+DI ${fmtNum(pdi, 1)}、−DI ${fmtNum(mdi, 1)}：${up ? '上漲力道大於下跌力道' : '下跌力道大於上漲力道'}。${
        adx < 20 ? 'ADX 偏低時，DI 交叉訊號比較容易失準。' : ''
      }${
        adx < 25
          ? 'ADX 是把最近 14 天平滑後算的，反應比較慢：單日的大漲大跌不會馬上讓它升高，要看之後幾天 ADX 有沒有往上走過 20～25，才知道新的趨勢有沒有成形。'
          : ''
      }`,
    };
  },
  strategy: {
    name: '+DI 上穿 −DI 買（ADX 過濾）',
    buyRule: '+DI 由下往上穿越 −DI，且 ADX 高於門檻（代表有趨勢），隔天開盤買進。',
    sellRule: '−DI 由下往上穿越 +DI，隔天開盤賣出。',
  },
};
