import { fmtNum } from '../../data/format';

/**
 * 「過去出現這種情況之後，價格怎麼走」的統計。
 * 說明裡只要想寫「容易反彈」「常常是低點」這類話，就用這個算出實際的次數，不要憑印象寫。
 */
export interface AfterStats {
  /** 之後看幾根 K 棒 */
  bars: number;
  /** 符合條件的日子有幾天（連續好幾天都符合時，每一天都算） */
  total: number;
  /** 其中幾天，bars 根 K 棒之後收盤比較高 */
  up: number;
  /** 符合條件的日子分成幾段（連續的日子算同一段），用來判斷差距是不是巧合 */
  episodes: number;
  /** 符合條件的日子，bars 根 K 棒之後的平均漲跌、最差的一次 */
  avgChg: number;
  worstChg: number;
  /** 所有日子（不管條件）的天數、上漲天數、平均漲跌，當成比較的基準 */
  allTotal: number;
  allUp: number;
  allAvgChg: number;
}

export function afterStats(candles: readonly { close: number }[], hit: (i: number) => boolean, bars: number): AfterStats {
  const st: AfterStats = { bars, total: 0, up: 0, episodes: 0, avgChg: 0, worstChg: 0, allTotal: 0, allUp: 0, allAvgChg: 0 };
  let sum = 0;
  let allSum = 0;
  let prev = false;
  for (let i = 0; i + bars < candles.length; i++) {
    const chg = candles[i + bars]!.close / candles[i]!.close - 1;
    st.allTotal++;
    allSum += chg;
    if (chg > 0) st.allUp++;
    const h = hit(i);
    if (h && !prev) st.episodes++;
    prev = h;
    if (!h) continue;
    st.total++;
    sum += chg;
    if (st.total === 1 || chg < st.worstChg) st.worstChg = chg;
    if (chg > 0) st.up++;
  }
  st.avgChg = st.total ? sum / st.total : 0;
  st.allAvgChg = st.allTotal ? allSum / st.allTotal : 0;
  return st;
}

/** 至少要有這麼多天才寫出比例 */
export const MIN_SAMPLE = 10;

/**
 * 寫成一句話。what 例如「乖離率到 −5% 以下」；side 是要強調漲還是跌的比例。
 * 一定同時寫出「所有日子」的比例，不然看不出這個條件到底有沒有差。
 */
export function afterText(st: AfterStats, what: string, side: 'up' | 'down'): string {
  // 條件以數字結尾時（例如「CCI 低於 −100」）補一個空白，比較好讀
  if (/[\d%]$/.test(what)) what += ' ';
  if (st.total < MIN_SAMPLE) return `這份資料裡，${what}的日子只有 ${st.total} 天，太少，看不出之後怎麼走。`;
  const k = side === 'up' ? st.up : st.total - st.up;
  const base = side === 'up' ? st.allUp : st.allTotal - st.allUp;
  const p = k / st.total;
  const p0 = base / st.allTotal;
  const pct = (x: number) => fmtNum(x * 100, 0);
  const sign = (x: number) => `${x >= 0 ? '+' : '−'}${fmtNum(Math.abs(x) * 100, 1)}%`;
  // 差距是不是巧合：連續的日子很像，所以用「幾段」當樣本數，粗估巧合時可能差到多少（約 2 個標準誤）
  const noise = 2 * Math.sqrt((p0 * (1 - p0)) / Math.max(1, st.episodes));
  const diff = Math.round((p - p0) * 100);
  const verdict =
    Math.abs(p - p0) < noise
      ? `差 ${Math.abs(diff)} 個百分點，不算明顯：這種情況分成 ${st.episodes} 段（連續的日子算一段），只有這麼多段時，光是巧合就可能差到約 ${pct(noise)} 個百分點，所以看不出這個條件有沒有差別。`
      : `${diff >= 0 ? '高' : '低'} ${Math.abs(diff)} 個百分點，算明顯：這種情況分成 ${st.episodes} 段（連續的日子算一段），光是巧合大約只會差到 ${pct(noise)} 個百分點。`;
  return `這份資料裡，${what}的日子有 ${st.total} 天，其中 ${k} 天（${pct(p)}%）在 ${st.bars} 根 K 棒之後價格比較${side === 'up' ? '高' : '低'}；所有日子是 ${pct(p0)}%，${verdict}這些日子 ${st.bars} 根 K 棒之後平均 ${sign(st.avgChg)}、最差 ${sign(st.worstChg)}（所有日子平均 ${sign(st.allAvgChg)}）。這是過去的統計，不保證這次一樣。`;
}

/** 連續符合條件最久的一次有幾根 K 棒 */
export function longestRun(n: number, hit: (i: number) => boolean): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < n; i++) {
    run = hit(i) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * 指標進到某個區間（例如超賣區）之後，價格怎麼走：一句話，附上最久連續待了幾根。
 * line 是和 K 棒對齊的指標數值。
 */
export function zoneNote(
  candles: readonly { close: number }[],
  line: readonly (number | null | undefined)[],
  inZone: (v: number) => boolean,
  what: string,
  side: 'up' | 'down',
  bars = 10,
): string {
  const hit = (i: number) => {
    const v = line[i];
    return v != null && inZone(v);
  };
  return `${afterText(afterStats(candles, hit, bars), what, side)}最久曾經連續 ${longestRun(candles.length, hit)} 根 K 棒都在這個區間。`;
}
