/** public/data/USDTWD.json：美元兌新台幣的每日收盤匯率（由 scripts/fetch-data.ts 產生） */
export interface FxDataFile {
  schemaVersion: 1;
  id: string;
  symbol: string;
  source: string;
  description: string;
  timezone: string;
  /** 抓取時間（ISO 8601, UTC） */
  updatedAt: string;
  /** 日期（YYYY-MM-DD），只有已經過完的日子 */
  t: string[];
  /** 1 美元可以換多少新台幣 */
  c: number[];
}

export interface FxRate {
  date: string;
  rate: number;
}

/**
 * 找 date 當天（含）以前最近一天的匯率；strict = true 時只找 date 以前（不含當天）。
 * 週末、假日沒有匯率，會用前一個有報價的日子。
 */
export function fxOn(fx: Pick<FxDataFile, 't' | 'c'>, date: string, strict = false): FxRate | null {
  const { t, c } = fx;
  let lo = 0;
  let hi = t.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ok = strict ? t[mid]! < date : t[mid]! <= date;
    if (ok) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 ? { date: t[found]!, rate: c[found]! } : null;
}
