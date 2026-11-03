/*
 * 比特幣的額外資料（市場情緒、合約、鏈上）：解析各個公開來源的格式、整理成「一天一個數字」。
 * 抓取流程在 scripts/fetch-extra.ts。
 */

export interface DailySeries {
  /** YYYY-MM-DD（UTC） */
  t: string[];
  v: number[];
}

export interface ExtraSeriesInfo extends DailySeries {
  label: string;
  unit: string;
  source: string;
}

export interface ExtraDataFile {
  schemaVersion: 1;
  asset: string;
  updatedAt: string;
  series: Record<string, ExtraSeriesInfo>;
}

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 依日期排序、同一天只留最後一筆、去掉不是有限數字的值 */
export function tidy(points: [string, number][]): DailySeries {
  const m = new Map<string, number>();
  for (const [t, v] of points) if (Number.isFinite(v) && /^\d{4}-\d{2}-\d{2}$/.test(t)) m.set(t, v);
  const t = [...m.keys()].sort();
  return { t, v: t.map((d) => m.get(d)!) };
}

/** alternative.me 恐懼貪婪指數：{ data: [{ value: "40", timestamp: "1551157200" }, …] }（新的在前） */
export function parseFearGreed(json: unknown): DailySeries {
  const data = (json as { data?: { value?: string; timestamp?: string }[] })?.data;
  if (!Array.isArray(data) || data.length === 0) throw new Error('恐懼貪婪指數：回應裡沒有資料');
  return tidy(data.map((d) => [utcDate(Number(d.timestamp) * 1000), Number(d.value)]));
}

/** Coin Metrics 社群版：{ data: [{ time: "2014-01-01T00:00:00.000000000Z", AdrActCnt: "123" }, …] } */
export function parseCoinMetrics(rows: unknown[], metric: string): DailySeries {
  return tidy(
    rows.map((r) => {
      const row = r as Record<string, string>;
      return [String(row.time ?? '').slice(0, 10), Number(row[metric])];
    }),
  );
}

/** 把一天裡的多筆資料（例如每 8 小時一次的資金費率）平均成一天一個數字 */
export function dailyAverage(points: [number, number][]): DailySeries {
  const sum = new Map<string, { s: number; n: number }>();
  for (const [ms, v] of points) {
    if (!Number.isFinite(ms) || !Number.isFinite(v)) continue;
    const d = utcDate(ms);
    const e = sum.get(d) ?? { s: 0, n: 0 };
    e.s += v;
    e.n += 1;
    sum.set(d, e);
  }
  return tidy([...sum.entries()].map(([d, e]) => [d, e.s / e.n]));
}

/** 幣安公開資料的資金費率 CSV：calc_time,funding_interval_hours,last_funding_rate（有些舊檔沒有標題列） */
export function parseBinanceFundingCsv(csv: string): [number, number][] {
  const out: [number, number][] = [];
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]!.toLowerCase();
  const cols = header.includes('calc_time') ? header.split(',').map((s) => s.trim()) : null;
  const ti = cols ? cols.indexOf('calc_time') : 0;
  const ri = cols ? cols.indexOf('last_funding_rate') : 2;
  for (const line of cols ? lines.slice(1) : lines) {
    const p = line.split(',');
    const t = Number(p[ti]);
    const r = Number(p[ri]);
    if (Number.isFinite(t) && Number.isFinite(r)) out.push([t, r]);
  }
  return out;
}

/** Coin Metrics 的資金費率：{ time, rate }，rate 是每一期（通常 8 小時）的費率 */
export function parseCoinMetricsFunding(rows: unknown[]): [number, number][] {
  return rows.map((r) => {
    const row = r as Record<string, string>;
    return [Date.parse(String(row.time)), Number(row.rate)];
  });
}

/** 新資料蓋過舊資料（同一天以新的為準），用來把歷史月檔和最近的資料接起來 */
export function mergeDaily(base: DailySeries, newer: DailySeries): DailySeries {
  const pts: [string, number][] = base.t.map((t, i) => [t, base.v[i]!]);
  for (let i = 0; i < newer.t.length; i++) pts.push([newer.t[i]!, newer.v[i]!]);
  return tidy(pts);
}

/** 每種資料合理的數值範圍；超出就當作資料有問題 */
export const VALID_RANGE: Record<string, [number, number]> = {
  fng: [0, 100],
  funding: [-0.01, 0.01],
  activeAddresses: [1, 1e8],
  txCount: [1, 1e8],
  hashRate: [1e-6, 1e12],
  mvrv: [0.05, 20],
};

/** 檢查一份資料是否可以覆蓋上一版；回傳問題清單（空的代表沒問題） */
export function validateSeries(key: string, s: DailySeries, prev: DailySeries | null): string[] {
  const errors: string[] = [];
  if (s.t.length < 30) errors.push(`資料太少（${s.t.length} 筆）`);
  const [lo, hi] = VALID_RANGE[key] ?? [-Infinity, Infinity];
  const bad = s.v.findIndex((v) => !(v >= lo && v <= hi));
  if (bad >= 0) errors.push(`${s.t[bad]} 的數值 ${s.v[bad]} 不合理`);
  for (let i = 1; i < s.t.length; i++) {
    if (s.t[i]! <= s.t[i - 1]!) {
      errors.push(`日期順序錯誤：${s.t[i - 1]} → ${s.t[i]}`);
      break;
    }
  }
  if (prev && prev.t.length > 0 && s.t.length < prev.t.length * 0.98) errors.push(`資料變少（${prev.t.length} → ${s.t.length} 筆）`);
  return errors;
}

/** 從 from（YYYY-MM）到 to（YYYY-MM）的每一個月 */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
