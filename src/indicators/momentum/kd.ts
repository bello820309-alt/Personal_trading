import type { Candle } from '../../data/types';
import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, highest, highs, lowest, lows, scanSignals, smoothFrom } from '../math/core';
import { zoneNote } from '../math/after';
import { dmiIndicator } from '../trend/dmi';
import { getLine, notesOf, type IndicatorDef, type Series } from '../types';

export type KdParams = { period: number; kSmooth: number; dSmooth: number; overbought: number; oversold: number };

/**
 * 台灣常用的 KD 算法：
 *   RSV = (今日收盤 − 最近 N 日最低) ÷ (最近 N 日最高 − 最近 N 日最低) × 100
 *   K = 昨日 K × 2/3 + 今日 RSV × 1/3（起始值 50）
 *   D = 昨日 D × 2/3 + 今日 K × 1/3（起始值 50）
 */
export function kdSeries(
  candles: Candle[],
  period: number,
  kSmooth: number,
  dSmooth: number,
): { rsv: Series; k: Series; d: Series } {
  const hh = highest(highs(candles), period);
  const ll = lowest(lows(candles), period);
  const close = closes(candles);
  const rsv: Series = close.map((c, i) => {
    const h = hh[i];
    const l = ll[i];
    if (c === null || h === null || h === undefined || l === null || l === undefined) return null;
    return h === l ? 50 : ((c - l) / (h - l)) * 100;
  });
  const k = smoothFrom(rsv, 1 / Math.max(1, kSmooth), 50);
  const d = smoothFrom(k, 1 / Math.max(1, dSmooth), 50);
  return { rsv, k, d };
}

export const kdIndicator: IndicatorDef<KdParams> = {
  id: 'kd',
  shortName: 'KD',
  name: '隨機指標',
  enName: 'Stochastic Oscillator（台灣 KD 算法）',
  category: 'momentum',
  placement: 'pane',
  params: [
    { key: 'period', type: 'number', label: 'RSV 天數', min: 3, max: 60, step: 1 },
    {
      key: 'kSmooth',
      type: 'number',
      label: 'K 值平滑',
      min: 1,
      max: 10,
      step: 1,
      help: '3 代表「今日 RSV 占 1/3、昨日 K 占 2/3」。',
    },
    { key: 'dSmooth', type: 'number', label: 'D 值平滑', min: 1, max: 10, step: 1 },
    { key: 'overbought', type: 'number', label: '高檔門檻', min: 50, max: 95, step: 1 },
    { key: 'oversold', type: 'number', label: '低檔門檻', min: 5, max: 50, step: 1 },
  ],
  defaults: { period: 9, kSmooth: 3, dSmooth: 3, overbought: 80, oversold: 20 },
  compute(candles, p) {
    const { k, d } = kdSeries(candles, p.period, p.kSmooth, p.dSmooth);
    return {
      lines: [
        { key: 'k', label: 'K', values: k, kind: 'line', color: 's0', width: 2 },
        { key: 'd', label: 'D', values: d, kind: 'line', color: 's1', width: 2 },
      ],
      levels: [
        { value: p.overbought, label: `${p.overbought}` },
        { value: 50, label: '50' },
        { value: p.oversold, label: `${p.oversold}` },
      ],
      scale: { min: 0, max: 100 },
    };
  },
  signals(candles, r, p) {
    const k = getLine(r, 'k');
    const d = getLine(r, 'd');
    return scanSignals(
      candles.length,
      (i) => crossOver(k, d, i) && (d[i] ?? 100) < p.oversold,
      (i) => crossUnder(k, d, i) && (d[i] ?? 0) > p.overbought,
      '低檔黃金交叉',
      '高檔死亡交叉',
    );
  },
  describe(candles, r, p) {
    const n = candles.length;
    const k = getLine(r, 'k');
    const d = getLine(r, 'd');
    const kv = k[n - 1];
    const dv = d[n - 1];
    if (kv == null || dv == null) return null;
    let highRun = 0;
    let lowRun = 0;
    for (let i = n - 1; i >= 0 && (k[i] ?? 0) > p.overbought; i--) highRun++;
    for (let i = n - 1; i >= 0 && (k[i] ?? 100) < p.oversold; i--) lowRun++;
    const head = `K ${fmtNum(kv, 1)}／D ${fmtNum(dv, 1)}`;
    const md = (i: number) => `${Number(candles[i]!.time.slice(5, 7))}/${Number(candles[i]!.time.slice(8, 10))}`;
    const pull = p.kSmooth > 1 ? `K 每天只往 RSV 靠近 1/${p.kSmooth}` : 'K 就等於 RSV';
    /** 第 i 天收盤在最近 N 天高低範圍裡的位置（RSV），用實際的價格寫出來 */
    const rsvText = (i: number) => {
      const from = Math.max(0, i - p.period + 1);
      let lo = from;
      let hi = from;
      for (let j = from; j <= i; j++) {
        if (candles[j]!.low < candles[lo]!.low) lo = j;
        if (candles[j]!.high > candles[hi]!.high) hi = j;
      }
      const L = candles[lo]!.low;
      const H = candles[hi]!.high;
      const rsv = H === L ? 50 : ((candles[i]!.close - L) / (H - L)) * 100;
      return {
        rsv,
        text: `收盤 ${fmtNum(candles[i]!.close)}，最近 ${p.period} 天最低是 ${md(lo)} 的 ${fmtNum(L)}、最高是 ${md(hi)} 的 ${fmtNum(H)}，收盤在這個範圍的位置是 RSV ${fmtNum(rsv, 1)}（0 是最低、100 是最高）`,
      };
    };
    /** 過去在低檔鈍化期間（K 連續 3 天以上低於門檻）出現的低檔黃金交叉，5 天內 K 又跌回 D 下面的有幾次 */
    const dullCrossStats = () => {
      let total = 0;
      let back = 0;
      for (let i = 1; i < n - 5; i++) {
        const a = k[i], b = d[i], pa = k[i - 1], pb = d[i - 1];
        if (a == null || b == null || pa == null || pb == null || !(pa <= pb && a > b && b < p.oversold)) continue;
        let run = 0;
        for (let j = i; j >= 0 && (k[j] ?? 100) < p.oversold; j--) run++;
        if (run < 3) continue;
        total++;
        for (let j = i + 1; j <= i + 5; j++) {
          if ((k[j] ?? 0) < (d[j] ?? 0)) {
            back++;
            break;
          }
        }
      }
      return total >= 5
        ? `這份資料裡，低檔鈍化期間出現的低檔黃金交叉有 ${total} 次，其中 ${back} 次在 5 天內 K 又跌回 D 下面（交叉很快就失效）。`
        : '';
    };
    // 最近一次 K、D 交叉
    let cross = '';
    let crossWhy = '';
    let lastCross: { i: number; golden: boolean; d: number } | null = null;
    for (let i = n - 1; i >= 1 && i >= n - 60; i--) {
      const a = k[i], b = d[i], pa = k[i - 1], pb = d[i - 1];
      if (a == null || b == null || pa == null || pb == null) break;
      const golden = pa <= pb && a > b;
      const dead = pa >= pb && a < b;
      if (!golden && !dead) continue;
      const day = `${Number(candles[i]!.time.slice(5, 7))}/${Number(candles[i]!.time.slice(8, 10))}`;
      const zone = golden ? (b < p.oversold ? `，交叉當天的 D 值 ${fmtNum(b, 1)} 在 ${p.oversold} 以下，算「低檔黃金交叉」` : `，交叉當天的 D 值 ${fmtNum(b, 1)}，不在 ${p.oversold} 以下，不算低檔交叉`)
        : b > p.overbought ? `，交叉當天的 D 值 ${fmtNum(b, 1)} 在 ${p.overbought} 以上，算「高檔死亡交叉」` : `，交叉當天的 D 值 ${fmtNum(b, 1)}，不在 ${p.overbought} 以上，不算高檔交叉`;
      cross = `最近一次交叉是 ${day} 的${golden ? '黃金交叉（K 往上穿過 D）' : '死亡交叉（K 往下穿過 D）'}${zone}。`;
      // 交叉那天價格反而是跌（漲）的：用那天實際的 RSV、K、D 說明為什麼還是交叉
      const chg = i >= 1 ? candles[i]!.close / candles[i - 1]!.close - 1 : 0;
      if ((golden && chg < 0) || (dead && chg > 0)) {
        const { text } = rsvText(i);
        // K、D 很接近時多顯示一位小數，才看得出誰比較大
        const close1 = fmtNum(a, 1) === fmtNum(b, 1);
        const ka = fmtNum(a, close1 ? 2 : 1);
        const kb = fmtNum(b, close1 ? 2 : 1);
        crossWhy = `那天價格其實${golden ? '跌' : '漲'}了 ${fmtNum(Math.abs(chg) * 100, 2)}%：KD 看的不是當天漲跌，而是收盤在最近 ${p.period} 天最高、最低之間的位置（RSV）。那天${text}；前一天的 K 是 ${fmtNum(pa, 1)}，RSV 比它${golden ? '高' : '低'}，${pull}，所以 K 被往${golden ? '上拉' : '下拉'}到 ${ka}，${golden ? '超過' : '跌破'}了 D（${kb}），出現交叉。這種交叉也可能只是短線的${golden ? '反彈' : '回檔'}，不一定代表${golden ? '跌勢' : '漲勢'}結束。`;
      }
      lastCross = { i, golden, d: b };
      break;
    }
    // 月線（20 日）、季線（60 日）往哪邊彎：很多人只在它們往上時才做 KD 的買進訊號
    const sma = (len: number, end: number) => {
      if (end - len + 1 < 0) return null;
      let sum = 0;
      for (let i = end - len + 1; i <= end; i++) sum += candles[i]!.close;
      return sum / len;
    };
    const dir = (len: number) => {
      const now = sma(len, n - 1);
      const past = sma(len, n - 6);
      if (now === null || past === null) return null;
      const ch = now / past - 1;
      return Math.abs(ch) < 0.002 ? '走平' : ch > 0 ? '往上彎' : '往下彎';
    };
    const m20 = dir(20);
    const m60 = dir(60);
    const maNote =
      m20 && m60
        ? `20 日均線${m20}、60 日均線${m60}（台股習慣叫月線、季線；美股和比特幣的圖表預設沒有 60 日線，可以在圖表的均線設定自己加上）${m20 === '往上彎' && m60 === '往上彎' ? '。' : '：如果你的規則是「月線、季線往上時才做 KD 的買進訊號」，現在還不符合。'}`
        : '';
    // 趨勢明確（ADX 25 以上）時 KD 要不要打折：寫出一般的說法，再用這份資料數給你看
    const adxLine = getLine(dmiIndicator.compute(candles, dmiIndicator.defaults), 'adx');
    const adx = adxLine[n - 1];
    let adxNote = '';
    if (adx != null && adx >= 25) {
      const AFTER = 10;
      const strong = [0, 0];
      const weak = [0, 0];
      for (let i = 1; i + AFTER < n; i++) {
        const a = k[i], b = d[i], pa = k[i - 1], pb = d[i - 1], x = adxLine[i];
        if (a == null || b == null || pa == null || pb == null || x == null || !(pa <= pb && a > b && b < p.oversold)) continue;
        const g = x >= 25 ? strong : weak;
        g[0]!++;
        if (candles[i + AFTER]!.close > candles[i]!.close) g[1]!++;
      }
      const few = strong[0]! < 20 || weak[0]! < 20 ? '次數很少，看不出明顯的差別，只能當參考。' : '';
      adxNote = `現在 ADX 是 ${fmtNum(adx, 1)}（25 以上代表趨勢明確）。一般的說法是：趨勢明確時 KD 會鈍化，低檔、高檔和交叉的訊號要打折看。這份資料裡，低檔黃金交叉發生時 ADX 在 25 以上的有 ${strong[0]} 次，${AFTER} 根 K 棒之後價格比較高的有 ${strong[1]} 次；ADX 低於 25 的有 ${weak[0]} 次，其中 ${weak[1]} 次之後價格比較高。${few}`;
    }
    const zoneHigh = () => zoneNote(candles, k, (x) => x > p.overbought, `K 高於 ${p.overbought}`, 'down');
    const zoneLow = () => zoneNote(candles, k, (x) => x < p.oversold, `K 低於 ${p.oversold}`, 'up');
    /** 每種狀態共用的補充說明；first 是這個狀態自己要先講的 */
    const notes = (...first: [string, string][]) =>
      notesOf(...first, ['最近一次交叉', cross], ['交叉那天價格為什麼反向', crossWhy], ['均線方向', maNote], ['趨勢強度（ADX）', adxNote]);
    if (highRun >= 3) {
      return {
        tone: 'bullish',
        headline: `${head}，高檔鈍化`,
        detail: `K 值已連續 ${highRun} 天高於 ${p.overbought}，代表買盤很強。這時「超買」反而是強勢的表現，不宜只因為 KD 高就看空。`,
        notes: notes(['過去 K 到高檔之後', zoneHigh()]),
      };
    }
    if (lowRun >= 3) {
      const dull =
        lastCross && lastCross.golden && lastCross.d < p.oversold && n - 1 - lastCross.i < lowRun
          ? `${md(lastCross.i)} 這次低檔黃金交叉，照本站回測的規則（D 低於 ${p.oversold} 時 K 往上穿過 D，隔天開盤買）算一次買進訊號；但它發生在低檔鈍化的期間（K 還一直在 ${p.oversold} 以下）。${dullCrossStats()}回測的成績已經包含這類交叉，沒有另外分開算。`
          : '';
      return {
        tone: 'bearish',
        headline: `${head}，低檔鈍化`,
        detail: `K 值已連續 ${lowRun} 天低於 ${p.oversold}，賣壓很重。低檔鈍化時，KD 低不代表馬上會反彈。`,
        notes: notesOf(['過去 K 到低檔之後', zoneLow()], ['最近一次交叉', cross], ['鈍化期間的交叉算不算', dull], ['交叉那天價格為什麼反向', crossWhy], ['均線方向', maNote], ['趨勢強度（ADX）', adxNote]),
      };
    }
    if (kv >= p.overbought) {
      const dNote = dv <= p.overbought ? `交叉算不算「高檔死亡交叉」看的是 D 值，現在 D 是 ${fmtNum(dv, 1)}，還不在 ${p.overbought} 以上，這時 K 往下穿過 D 也不算高檔交叉。` : '';
      return { tone: 'hot', headline: `${head}，進入高檔`, detail: `K 值高於 ${p.overbought}，短線漲多、偏熱。`, notes: notes(['過去 K 到高檔之後', zoneHigh()], ['現在交叉算不算高檔交叉', dNote]) };
    }
    if (kv <= p.oversold) {
      const dNote = dv >= p.oversold ? `交叉算不算「低檔黃金交叉」看的是 D 值，現在 D 是 ${fmtNum(dv, 1)}，還不在 ${p.oversold} 以下，這時 K 往上穿過 D 也不算低檔交叉。` : '';
      return { tone: 'cold', headline: `${head}，進入低檔`, detail: `K 值低於 ${p.oversold}，短線跌深、偏冷。`, notes: notes(['過去 K 到低檔之後', zoneLow()], ['現在交叉算不算低檔交叉', dNote]) };
    }
    const todayChg = n >= 2 ? candles[n - 1]!.close / candles[n - 2]!.close - 1 : 0;
    const pk = k[n - 2];
    let lagTitle = '';
    let lagNote = '';
    if (pk != null && ((kv > dv && todayChg <= -0.03) || (kv < dv && todayChg >= 0.03))) {
      const fell = todayChg < 0;
      const { text } = rsvText(n - 1);
      lagTitle = `今天大${fell ? '跌' : '漲'}，K 為什麼還在 D 之${fell ? '上' : '下'}`;
      lagNote = `今天${fell ? '跌' : '漲'}了 ${fmtNum(Math.abs(todayChg) * 100, 2)}%，K 卻還在 D 之${fell ? '上' : '下'}：今天${text}；前一天的 K 是 ${fmtNum(pk, 1)}，${pull}，所以 K 只${fell ? '降' : '升'}到 ${fmtNum(kv, 1)}，還在 D（${fmtNum(dv, 1)}）之${fell ? '上' : '下'}。KD 是平滑過的，反應比價格慢，要看接下來 K 會不會${fell ? '跌破' : '漲過'} D。`;
    }
    return kv > dv
      ? { tone: 'bullish', headline: `${head}，K 在 D 之上`, detail: `K 值在 D 值之上，短線動能偏多。${lagNote ? '今天價格大跌，K 還沒翻過來（下面有說明）。' : ''}`, notes: notes([lagTitle, lagNote]) }
      : { tone: 'bearish', headline: `${head}，K 在 D 之下`, detail: `K 值在 D 值之下，短線動能偏空。${lagNote ? '今天價格大漲，K 還沒翻過來（下面有說明）。' : ''}`, notes: notes([lagTitle, lagNote]) };
  },
  strategy: {
    name: 'KD 低檔黃金交叉買、高檔死亡交叉賣',
    buyRule: 'D 值低於低檔門檻（20）時，K 由下往上穿越 D（低檔黃金交叉），隔天開盤買進。',
    sellRule: 'D 值高於高檔門檻（80）時，K 由上往下跌破 D（高檔死亡交叉），隔天開盤賣出。',
  },
};
