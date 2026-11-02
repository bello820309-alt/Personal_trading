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
