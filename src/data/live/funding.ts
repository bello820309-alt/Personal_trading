import { lastDate, type ExtraDataFile } from '../extra';

/*
 * 比特幣資金費率的「最近幾天」：GitHub Actions 的伺服器在美國，幣安 API 不回應（HTTP 451），
 * 幣安公開資料又只有月檔（那個月過完才有），所以月中的資料會停在上個月底。
 * 在台灣用瀏覽器打開網頁時，瀏覽器可以直接呼叫幣安 API，這裡把上個月底之後、已經過完的日子補上。
 * 呼叫失敗（被擋、跨網域限制、逾時）就照舊，卡片會寫「資料停在 …」。
 */

const API = 'https://fapi.binance.com/fapi/v1/fundingRate';
const DAY = 86400000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** 幣安 API：[{ symbol, fundingTime, fundingRate: "0.00010000", markPrice }] → [時間, 費率] */
export function parseFundingRates(json: unknown): [number, number][] {
  if (!Array.isArray(json)) return [];
  const out: [number, number][] = [];
  for (const r of json) {
    const t = Number((r as Record<string, unknown>)?.fundingTime);
    const v = Number((r as Record<string, unknown>)?.fundingRate);
    if (Number.isFinite(t) && Number.isFinite(v)) out.push([t, v]);
  }
  return out;
}

/**
 * 把每 8 小時一筆的費率平均成一天一個數字，接在資金費率後面（只接 todayMs 之前、已經過完的日子）。
 * 沒有新的日子就回傳原本的檔案。
 */
export function appendFunding(file: ExtraDataFile, points: [number, number][], todayMs: number): ExtraDataFile {
  const s = file.series.funding;
  const end = s ? lastDate(s) : null;
  if (!s || !end) return file;
  const sums = new Map<number, { sum: number; n: number }>();
  for (const [t, v] of points) {
    const day = Math.floor(t / DAY) * DAY;
    if (day <= toMs(end) || day >= todayMs) continue;
    const e = sums.get(day) ?? { sum: 0, n: 0 };
    e.sum += v;
    e.n += 1;
    sums.set(day, e);
  }
  if (sums.size === 0) return file;
  const start = toMs(s.start);
  const v = s.v.slice();
  for (const [day, e] of [...sums.entries()].sort((a, b) => a[0] - b[0])) {
    const i = Math.round((day - start) / DAY);
    while (v.length < i) v.push(null);
    v[i] = Number((e.sum / e.n).toPrecision(6));
  }
  return {
    ...file,
    series: { ...file.series, funding: { ...s, v, source: `${s.source}＋幣安 API（瀏覽器補最近幾天）` } },
  };
}

/** 資金費率停在昨天以前時，試著用幣安 API 補上；失敗就回傳原本的檔案 */
export async function topUpFunding(file: ExtraDataFile, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<ExtraDataFile> {
  const s = file.series.funding;
  const end = s ? lastDate(s) : null;
  const todayMs = Math.floor(now / DAY) * DAY;
  if (!end || toMs(end) >= todayMs - DAY) return file;
  try {
    const res = await fetchImpl(`${API}?symbol=BTCUSDT&startTime=${toMs(end) + DAY}&limit=1000`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return file;
    return appendFunding(file, parseFundingRates(await res.json()), todayMs);
  } catch {
    return file;
  }
}
