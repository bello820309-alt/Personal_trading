import { dmiIndicator } from './dmi';
import { fmtNum, fmtPct } from '../../data/format';
import { nulls, scanSignals } from '../math/core';
import { getLine, type ColorRole, type IndicatorDef, notesOf } from '../types';

export type PsarParams = { step: number; max: number };

export const psarIndicator: IndicatorDef<PsarParams> = {
  id: 'psar',
  shortName: 'SAR',
  name: '拋物線轉向指標',
  enName: 'Parabolic SAR (Stop and Reverse)',
  category: 'trend',
  placement: 'overlay',
  params: [
    {
      key: 'step',
      type: 'number',
      label: '加速因子（起始與每次增加）',
      min: 0.005,
      max: 0.1,
      step: 0.005,
      help: '越大越靈敏，SAR 追得越緊，翻轉次數也越多。',
    },
    { key: 'max', type: 'number', label: '加速因子上限', min: 0.05, max: 0.5, step: 0.01 },
  ],
  defaults: { step: 0.02, max: 0.2 },
  compute(candles, p) {
    const n = candles.length;
    const sar = nulls(n);
    const trend = nulls(n);
    if (n >= 2) {
      const c0 = candles[0]!;
      const c1 = candles[1]!;
      let up = c1.close >= c0.close;
      let ep = up ? Math.max(c0.high, c1.high) : Math.min(c0.low, c1.low);
      let s = up ? Math.min(c0.low, c1.low) : Math.max(c0.high, c1.high);
      let af = p.step;
      sar[1] = s;
      trend[1] = up ? 1 : -1;
      for (let i = 2; i < n; i++) {
        const c = candles[i]!;
        s = s + af * (ep - s);
        // SAR 不能進入前兩根 K 棒的範圍
        if (up) s = Math.min(s, candles[i - 1]!.low, candles[i - 2]!.low);
        else s = Math.max(s, candles[i - 1]!.high, candles[i - 2]!.high);

        if (up && c.low < s) {
          // 跌破 SAR：翻空，新的 SAR 從上一段的最高點開始
          up = false;
          s = Math.max(ep, c.high);
          ep = c.low;
          af = p.step;
        } else if (!up && c.high > s) {
          up = true;
          s = Math.min(ep, c.low);
          ep = c.high;
          af = p.step;
        } else if (up && c.high > ep) {
          ep = c.high;
          af = Math.min(af + p.step, p.max);
        } else if (!up && c.low < ep) {
          ep = c.low;
          af = Math.min(af + p.step, p.max);
        }
        sar[i] = s;
        trend[i] = up ? 1 : -1;
      }
    }
    const colors: (ColorRole | null)[] = trend.map((t) => (t === null ? null : t > 0 ? 'up' : 'down'));
    return {
      lines: [
        { key: 'sar', label: 'SAR', values: sar, kind: 'dots', color: 'hot', colors },
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
      'SAR 翻多',
      'SAR 翻空',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const s = getLine(r, 'sar')[n - 1];
    const t = getLine(r, 'trend')[n - 1];
    if (s == null || t == null) return null;
    const close = candles[n - 1]!.close;
    const up = t > 0;
    // 和 DMI 方向相反、而且 ADX 25 以上（趨勢明確）時：寫出過去這種翻轉有幾次很快又翻回去
    const dmi = dmiIndicator.compute(candles, dmiIndicator.defaults);
    const adx = getLine(dmi, 'adx');
    const pdi = getLine(dmi, 'pdi');
    const mdi = getLine(dmi, 'mdi');
    const tr = getLine(r, 'trend');
    const against = (i: number, dir: number) => {
      const a = adx[i], p = pdi[i], m = mdi[i];
      return a != null && p != null && m != null && a >= 25 && (dir > 0 ? m > p : p > m);
    };
    let conflict = '';
    if (against(n - 1, t)) {
      const AFTER = 10;
      let total = 0;
      let back = 0;
      for (let i = 1; i + AFTER < n; i++) {
        if (tr[i] == null || tr[i - 1] == null || tr[i] === tr[i - 1] || tr[i] !== t || !against(i, t)) continue;
        total++;
        for (let j = i + 1; j <= i + AFTER; j++) {
          if (tr[j] !== t) {
            back++;
            break;
          }
        }
      }
      conflict =
        `現在 ADX 是 ${fmtNum(adx[n - 1]!, 1)}（25 以上，趨勢明確），DMI 是${t > 0 ? '−DI 大於 +DI（下跌力道比較大）' : '+DI 大於 −DI（上漲力道比較大）'}，和 SAR 的方向相反。SAR 翻轉之後，加速因子從 0.02 重新開始、點離價格很近，很容易被碰到又翻回去。` +
        (total >= 5
          ? `這份資料裡，像這樣在趨勢明確、方向和 DMI 相反時翻${t > 0 ? '多' : '空'}的有 ${total} 次，其中 ${back} 次在 ${AFTER} 根 K 棒內又翻回去。`
          : '') +
        '照總覽「意見不一致時」的說法，趨勢指標彼此方向相反，代表方向還不明確。';
    }
    return {
      tone: up ? 'bullish' : 'bearish',
      headline: up ? 'SAR 在價格下方（多方）' : 'SAR 在價格上方（空方）',
      detail: `SAR = ${fmtNum(s)}，距離收盤價 ${fmtPct(s / close - 1)}。${
        up ? '盤中最低價跌破這個價位就會翻空（不用等收盤），常被當成「移動停損」的參考。' : '盤中最高價漲過這個價位就會翻多（不用等收盤）。'
      }`,
      notes: notesOf(['和 DMI 方向相反時', conflict]),
    };
  },
  strategy: {
    name: 'SAR 翻多買、翻空賣',
    buyRule: '價格漲破 SAR、SAR 從上方翻到下方（翻多），隔天開盤買進。',
    sellRule: '價格跌破 SAR、SAR 從下方翻到上方（翻空），隔天開盤賣出。',
  },
};
