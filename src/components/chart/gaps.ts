/*
 * 線圖遇到空白資料時，圖表元件（lightweight-charts 5）仍會把空白前後的兩點連起來，
 * 而一段線的顏色跟著「起點」那一點。所以把每一段在空白之前的最後一點設成透明，
 * 跨過空白的那條連接線就不會畫出來（例如 SuperTrend 翻空時，多方線應該斷開）。
 */

export const GAP_COLOR = 'rgba(0, 0, 0, 0)';

type Point = { time: unknown; value?: number; color?: string };

/** points：依時間排好的資料點，沒有 value 的是空白。回傳新的陣列，不改動原本的。 */
export function breakLineGaps<T extends Point>(points: readonly T[]): T[] {
  const out = points.slice();
  let lastValue = -1;
  let gapSince = false;
  for (let i = 0; i < out.length; i++) {
    const p = out[i]!;
    if (p.value === undefined) {
      if (lastValue >= 0) gapSince = true;
      continue;
    }
    if (gapSince && lastValue >= 0) out[lastValue] = { ...out[lastValue]!, color: GAP_COLOR };
    gapSince = false;
    lastValue = i;
  }
  return out;
}

