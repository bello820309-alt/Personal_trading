/*
 * 抓取比特幣的額外資料（市場情緒、合約、鏈上），寫到 public/data/BTC_extra.json。
 * 由 GitHub Actions 在抓完行情後執行，也可以手動執行：npm run fetch-extra
 *
 * - 恐懼貪婪指數：alternative.me（免費、不需金鑰，2018 年起）
 * - 資金費率：Coin Metrics 社群版（2026/11 起免費版已不提供）；再用幣安公開資料的月檔（data.binance.vision）。
 *   月檔要那個月過完才有，這個月的部分先試日檔，再試幣安 API（幣安 API 可能會擋美國的伺服器，
 *   GitHub Actions 的伺服器在美國；擋掉就只到上個月底，網站上的卡片會寫「資料停在 …」）
 * - 鏈上資料：Coin Metrics 社群版 API（免費、不需金鑰，非商業用途）
 *
 * 任何一項抓取或檢查失敗，都保留上一版的那一項資料，不會影響其他項目。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromCompact, toCompact, type ExtraDataFile, type ExtraKey, type ExtraSeriesFile } from '../src/data/extra.ts';
import {
  dailyAverage,
  mergeDaily,
  monthsBetween,
  parseBinanceFundingApi,
  parseBinanceFundingCsv,
  parseCoinMetrics,
  parseCoinMetricsFunding,
  parseFearGreed,
  validateSeries,
  type DailySeries,
} from './lib/extra.ts';
import { describeError } from './lib/yahoo.ts';
import { readFirstZipEntry } from './lib/zip.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'data', 'BTC_extra.json');
const UA = 'Mozilla/5.0 (compatible; personal-trading-data/1.0; +https://github.com/bello820309-alt/Personal_trading)';
const CM = 'https://community-api.coinmetrics.io/v4';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get(url: string, kind: 'json'): Promise<any>;
async function get(url: string, kind: 'buffer'): Promise<Buffer>;
async function get(url: string, kind: 'json' | 'buffer'): Promise<unknown> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
        throw new HttpError(`HTTP ${res.status}${body ? `：${body}` : ''}`, res.status);
      }
      return kind === 'json' ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      // 404（檔案不存在）、400／401／403（沒有權限、參數不對）重試也沒用
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw last;
}

async function coinMetricsRows(path: string, params: Record<string, string>): Promise<unknown[]> {
  const rows: unknown[] = [];
  let url = `${CM}${path}?${new URLSearchParams({ ...params, page_size: '10000' }).toString()}`;
  for (let page = 0; page < 30 && url; page++) {
    const json = (await get(url, 'json')) as { data?: unknown[]; next_page_url?: string };
    rows.push(...(json.data ?? []));
    url = json.next_page_url ?? '';
    await sleep(800); // 社群版限制每 6 秒 10 次
  }
  return rows;
}

async function coinMetricsMetric(metric: string): Promise<DailySeries> {
  const rows = await coinMetricsRows('/timeseries/asset-metrics', { assets: 'btc', metrics: metric, frequency: '1d', start_time: '2014-01-01' });
  return parseCoinMetrics(rows, metric);
}

type Fetched = { series: DailySeries; source: string };

async function fetchFearGreed(): Promise<Fetched> {
  const json = await get('https://api.alternative.me/fng/?limit=0&format=json', 'json');
  return { series: parseFearGreed(json), source: 'alternative.me（Crypto Fear & Greed Index）' };
}

async function fetchMvrv(): Promise<Fetched> {
  try {
    return { series: await coinMetricsMetric('CapMVRVCur'), source: 'Coin Metrics 社群版（CapMVRVCur）' };
  } catch (e) {
    console.log(`  · CapMVRVCur 無法取得（${describeError(e)}），改用市值 ÷ 實現市值計算`);
    const mcap = await coinMetricsMetric('CapMrktCurUSD');
    const real = await coinMetricsMetric('CapRealUSD');
    const r = new Map(real.t.map((t, i) => [t, real.v[i]!]));
    const t: string[] = [];
    const v: number[] = [];
    mcap.t.forEach((d, i) => {
      const x = r.get(d);
      if (x && x > 0) {
        t.push(d);
        v.push(mcap.v[i]! / x);
      }
    });
    return { series: { t, v }, source: 'Coin Metrics 社群版（CapMrktCurUSD ÷ CapRealUSD）' };
  }
}

/** 資金費率：先試 Coin Metrics；不行或不夠新，再用幣安公開資料的月檔補 */
async function fetchFunding(prev: DailySeries | null): Promise<Fetched> {
  const sources: string[] = [];
  let series: DailySeries = { t: [], v: [] };
  try {
    const rows = await coinMetricsRows('/timeseries/market-funding-rates', { markets: 'binance-BTCUSDT-future', start_time: '2019-09-01' });
    const s = dailyAverage(parseCoinMetricsFunding(rows));
    if (s.t.length) {
      series = s;
      sources.push('Coin Metrics 社群版（binance-BTCUSDT-future）');
    }
  } catch (e) {
    console.log(`  · Coin Metrics 的資金費率無法取得：${describeError(e)}`);
  }

  // 幣安公開資料：每個月一個 zip（只有已經過完的月份）
  const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const have = series.t.length ? series : prev && prev.t.length ? prev : null;
  const firstNeeded = series.t.length ? null : have ? have.t[have.t.length - 1]!.slice(0, 7) : '2019-09';
  if (firstNeeded) {
    let base: DailySeries = have ?? { t: [], v: [] };
    let got = 0;
    for (const ym of monthsBetween(firstNeeded, lastMonth)) {
      const url = `https://data.binance.vision/data/futures/um/monthly/fundingRate/BTCUSDT/BTCUSDT-fundingRate-${ym}.zip`;
      try {
        const zip = await get(url, 'buffer');
        base = mergeDaily(base, dailyAverage(parseBinanceFundingCsv(readFirstZipEntry(zip).data.toString('utf8'))));
        got++;
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) continue;
        throw new Error(`幣安公開資料 ${ym}：${describeError(e)}`);
      }
    }
    console.log(`  · 幣安公開資料：讀了 ${got} 個月檔`);
    // 沒有新的月檔（例如上一版已經用 API 補到這個月）時，沿用上一版，後面再補最近幾天
    if (got > 0 || base.t.length) {
      series = base;
      sources.push('幣安公開資料（data.binance.vision 月檔）');
    }
  }
  // 月檔只到上個月底：這個月的部分先試幣安公開資料的日檔，再試幣安 API（API 可能擋美國的伺服器）
  if (series.t.length) {
    const tail = await fundingTail(series.t[series.t.length - 1]!);
    if (tail) {
      series = mergeDaily(series, tail.series);
      sources.push(tail.source);
    }
  }
  if (!series.t.length) throw new Error('所有來源都抓不到資金費率');
  return { series, source: sources.join('＋') };
}

const DAY_MS = 86400000;

/** 從 after 的隔天補到昨天（UTC）：日檔或 API，哪個能用就用哪個；都不行回傳 null */
async function fundingTail(after: string): Promise<Fetched | null> {
  const from = Date.parse(`${after}T00:00:00Z`) + DAY_MS;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if (from >= today) return null;

  // 1. 日檔：data.binance.vision/data/futures/um/daily/fundingRate/…（不一定有提供，第一個就 404 表示沒有）
  let daily: DailySeries = { t: [], v: [] };
  let got = 0;
  for (let ms = from; ms < today; ms += DAY_MS) {
    const d = new Date(ms).toISOString().slice(0, 10);
    const url = `https://data.binance.vision/data/futures/um/daily/fundingRate/BTCUSDT/BTCUSDT-fundingRate-${d}.zip`;
    try {
      const zip = await get(url, 'buffer');
      daily = mergeDaily(daily, dailyAverage(parseBinanceFundingCsv(readFirstZipEntry(zip).data.toString('utf8'))));
      got++;
    } catch (e) {
      if (got === 0) {
        console.log(`  · 幣安公開資料的日檔：${describeError(e)}（${d}），改試 API`);
        break;
      }
      // 最近一兩天的日檔可能還沒出來
      if (e instanceof HttpError && e.status === 404) break;
      console.log(`  · 幣安公開資料的日檔 ${d}：${describeError(e)}`);
      break;
    }
  }
  if (got > 0) {
    console.log(`  · 幣安公開資料：讀了 ${got} 個日檔（到 ${daily.t[daily.t.length - 1]}）`);
    return { series: daily, source: '幣安公開資料（日檔）' };
  }

  // 2. 幣安 API：一次最多 1000 筆（每 8 小時一筆，約 333 天）
  try {
    const rows = (await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=${from}&limit=1000`, 'json')) as unknown[];
    const s = dailyAverage(parseBinanceFundingApi(rows));
    // 只用已經過完的日子（今天還沒收完三筆）
    const done = { t: [] as string[], v: [] as number[] };
    s.t.forEach((t, i) => {
      if (Date.parse(`${t}T00:00:00Z`) < today) {
        done.t.push(t);
        done.v.push(s.v[i]!);
      }
    });
    if (done.t.length) {
      console.log(`  · 幣安 API：補了 ${done.t.length} 天（到 ${done.t[done.t.length - 1]}）`);
      return { series: done, source: '幣安 API（最近幾天）' };
    }
    console.log('  · 幣安 API：沒有新的資料');
  } catch (e) {
    console.log(`  · 幣安 API 無法取得：${describeError(e)}`);
  }
  return null;
}

interface Task {
  key: ExtraKey;
  label: string;
  unit: string;
  round: (x: number) => number;
  run: (prev: DailySeries | null) => Promise<Fetched>;
}

const r0 = (x: number) => Math.round(x);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const sig = (x: number) => Number(x.toPrecision(6));

const TASKS: Task[] = [
  { key: 'fng', label: '恐懼貪婪指數', unit: '分（0～100）', round: r0, run: fetchFearGreed },
  { key: 'funding', label: '資金費率（每 8 小時、一天平均）', unit: '比例', round: sig, run: fetchFunding },
  {
    key: 'activeAddresses',
    label: '活躍地址數',
    unit: '個',
    round: r0,
    run: async () => ({ series: await coinMetricsMetric('AdrActCnt'), source: 'Coin Metrics 社群版（AdrActCnt）' }),
  },
  {
    key: 'txCount',
    label: '鏈上交易筆數',
    unit: '筆',
    round: r0,
    run: async () => ({ series: await coinMetricsMetric('TxCnt'), source: 'Coin Metrics 社群版（TxCnt）' }),
  },
  {
    key: 'hashRate',
    label: '算力',
    unit: 'TH/s',
    round: sig,
    run: async () => ({ series: await coinMetricsMetric('HashRate'), source: 'Coin Metrics 社群版（HashRate）' }),
  },
  { key: 'mvrv', label: 'MVRV（市值 ÷ 實現市值）', unit: '倍', round: r3, run: fetchMvrv },
];

function readPrev(): ExtraDataFile | null {
  if (!existsSync(outPath)) return null;
  try {
    return JSON.parse(readFileSync(outPath, 'utf8')) as ExtraDataFile;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const prev = readPrev();
  const series: Record<string, ExtraSeriesFile> = { ...(prev?.series ?? {}) };
  let failures = 0;
  for (const task of TASKS) {
    console.log(`▶ ${task.key}（${task.label}）`);
    const prevSeries = prev?.series[task.key] ? fromCompact(prev.series[task.key]!) : null;
    try {
      const { series: s, source } = await task.run(prevSeries);
      const rounded = { t: s.t, v: s.v.map(task.round) };
      const errors = validateSeries(task.key, rounded, prevSeries);
      if (errors.length) throw new Error(`資料檢查沒通過：${errors.join('；')}`);
      series[task.key] = { label: task.label, unit: task.unit, source, ...toCompact(rounded.t, rounded.v) };
      console.log(`  ✓ ${rounded.t.length} 筆：${rounded.t[0]} ～ ${rounded.t[rounded.t.length - 1]}，最新 ${rounded.v[rounded.v.length - 1]}（${source}）`);
    } catch (e) {
      failures++;
      console.log(`  ✗ ${describeError(e)}${prevSeries ? '（保留上一版）' : ''}`);
    }
  }
  const changed = !prev || JSON.stringify(prev.series) !== JSON.stringify(series);
  if (changed && Object.keys(series).length > 0) {
    const file: ExtraDataFile = { schemaVersion: 1, asset: 'BTC', updatedAt: new Date().toISOString(), series };
    writeFileSync(outPath, `${JSON.stringify(file)}\n`);
    console.log(`已寫入 ${outPath}（${Object.keys(series).join('、')}）`);
  } else {
    console.log('資料沒有變化，檔案不變。');
  }
  if (failures) {
    console.log(`有 ${failures} 項抓取失敗（已保留上一版資料）。`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
