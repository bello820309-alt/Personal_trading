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
  /** 所有日子（不管條件）的天數和上漲天數，當成比較的基準 */
  allTotal: number;
  allUp: number;
}

export function afterStats(candles: readonly { close: number }[], hit: (i: number) => boolean, bars: number): AfterStats {
  const st: AfterStats = { bars, total: 0, up: 0, allTotal: 0, allUp: 0 };
  for (let i = 0; i + bars < candles.length; i++) {
    const rose = candles[i + bars]!.close > candles[i]!.close;
    st.allTotal++;
    if (rose) st.allUp++;
    if (!hit(i)) continue;
    st.total++;
    if (rose) st.up++;
  }
  return st;
}

/** 至少要有這麼多天才寫出比例 */
export const MIN_SAMPLE = 10;

/**
 * 寫成一句話。what 例如「乖離率到 −5% 以下」；side 是要強調漲還是跌的比例。
 * 一定同時寫出「所有日子」的比例，不然看不出這個條件到底有沒有差。
 */
export function afterText(st: AfterStats, what: string, side: 'up' | 'down'): string {
  if (st.total < MIN_SAMPLE) return `這份資料裡，${what}的日子只有 ${st.total} 天，太少，看不出之後怎麼走。`;
  const k = side === 'up' ? st.up : st.total - st.up;
  const base = side === 'up' ? st.allUp : st.allTotal - st.allUp;
  const pct = (a: number, b: number) => fmtNum((a / b) * 100, 0);
  return `這份資料裡，${what}的日子有 ${st.total} 天，其中 ${k} 天（${pct(k, st.total)}%）在 ${st.bars} 根 K 棒之後價格比較${side === 'up' ? '高' : '低'}；不管有沒有這個條件，所有日子是 ${pct(base, st.allTotal)}%。連續好幾天都符合時每一天都算，所以這是「幾天」不是「幾次」；這是過去的統計，不保證這次一樣。`;
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
