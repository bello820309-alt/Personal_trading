import type { AssetDataFile } from '../../src/data/types.ts';

/**
 * 還原權息價允許的誤差（相對 0.01%）。
 * Yahoo 每次回傳的還原權息價，最後一位小數會有 ±1 的差異（例如 9.1777／9.1778）；
 * 真正的配息調整至少有 0.1% 以上，而且一定會同時出現新的配息事件。
 */
export const ADJ_CLOSE_TOLERANCE = 1e-4;

const sameArray = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

const closeEnough = (a: number, b: number): boolean => Math.abs(a - b) <= ADJ_CLOSE_TOLERANCE * Math.max(1, Math.abs(b));

/**
 * 兩份資料的行情內容是否相同：日期、開高低收、成交量、配息與分割都必須完全一樣，
 * 還原權息價只允許 Yahoo 的捨入誤差。相同就不需要改檔案，也就不會 commit 和重新部署。
 */
export function sameMarketData(prev: AssetDataFile, next: AssetDataFile): boolean {
  const a = prev.bars;
  const b = next.bars;
  return (
    sameArray(a.t, b.t) &&
    sameArray(a.o, b.o) &&
    sameArray(a.h, b.h) &&
    sameArray(a.l, b.l) &&
    sameArray(a.c, b.c) &&
    sameArray(a.v, b.v) &&
    a.ac.length === b.ac.length &&
    a.ac.every((x, i) => closeEnough(x, b.ac[i])) &&
    JSON.stringify(prev.events) === JSON.stringify(next.events)
  );
}

/** 最近幾根 K 棒的範圍：Yahoo 偶爾會暫時少掉最近的某一天，在這個範圍內的就從上一版補回來 */
export const RESTORE_LOOKBACK = 10;

/**
 * Yahoo 偶爾會暫時少掉最近已經收盤的某一天（例如 2026/11/4 凌晨抓 0050 時少了 11/3），
 * 直接覆蓋會把已經存好的資料刪掉。上一版最近幾根裡，這次沒有出現的日子，用上一版的數字補回來。
 */
export function restoreLostBars(prev: AssetDataFile | null, next: AssetDataFile): { file: AssetDataFile; restored: string[] } {
  if (!prev || prev.bars.t.length === 0 || next.bars.t.length === 0) return { file: next, restored: [] };
  const have = new Set(next.bars.t);
  const firstNew = next.bars.t[0]!;
  const p = prev.bars;
  const start = Math.max(0, p.t.length - RESTORE_LOOKBACK);
  const lost: number[] = [];
  for (let j = start; j < p.t.length; j++) if (!have.has(p.t[j]!) && p.t[j]! >= firstNew) lost.push(j);
  if (lost.length === 0) return { file: next, restored: [] };
  const n = next.bars;
  const rows = n.t.map((t, i) => ({ t, o: n.o[i]!, h: n.h[i]!, l: n.l[i]!, c: n.c[i]!, v: n.v[i]!, ac: n.ac[i]! }));
  for (const j of lost) rows.push({ t: p.t[j]!, o: p.o[j]!, h: p.h[j]!, l: p.l[j]!, c: p.c[j]!, v: p.v[j]!, ac: p.ac[j]! });
  rows.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const bars = {
    t: rows.map((r) => r.t),
    o: rows.map((r) => r.o),
    h: rows.map((r) => r.h),
    l: rows.map((r) => r.l),
    c: rows.map((r) => r.c),
    v: rows.map((r) => r.v),
    ac: rows.map((r) => r.ac),
  };
  return { file: { ...next, bars }, restored: lost.map((j) => p.t[j]!) };
}
