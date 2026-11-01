import type { AssetConfig } from '../../src/config/assets.ts';
import type { AssetDataFile, DividendEvent, SplitEvent } from '../../src/data/types.ts';

/** Yahoo v8 chart 回應中我們會用到的欄位 */
interface YahooChartResult {
  meta?: {
    currency?: string;
    symbol?: string;
    exchangeTimezoneName?: string;
    currentTradingPeriod?: { regular?: { start?: number; end?: number } };
  };
  timestamp?: number[];
  events?: {
    dividends?: Record<string, { amount?: number; date?: number }>;
    splits?: Record<string, { date?: number; numerator?: number; denominator?: number }>;
  };
  indicators?: {
    quote?: {
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }[];
    adjclose?: { adjclose?: (number | null)[] }[];
  };
}

export interface NormalizeResult {
  file: AssetDataFile;
  warnings: string[];
  /** Yahoo 回報的幣別（用來檢查代號有沒有抓錯） */
  currency: string | undefined;
}

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

const isPos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function dateFormatter(timeZone: string): (unixSec: number) => string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (sec: number) => fmt.format(new Date(sec * 1000));
}

/**
 * 把 Yahoo 的回應整理成 App 使用的格式：
 * - 時間換成「交易所當地日期」
 * - 拿掉空值、修正少數高低價不一致的資料、同一天重複時保留最後一筆
 * - 價格保留 4 位小數（0050 分割後的歷史價格會有 3～4 位小數）
 */
export function normalizeYahooChart(json: unknown, asset: AssetConfig, now: Date): NormalizeResult {
  const result = (json as { chart?: { result?: YahooChartResult[] } })?.chart?.result?.[0];
  if (!result) throw new Error('回應裡沒有 chart.result');
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0];
  if (!q || ts.length === 0) throw new Error('回應裡沒有價格資料');
  const ac = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const tz = result.meta?.exchangeTimezoneName || asset.timezone;
  const toDate = dateFormatter(tz);
  const warnings: string[] = [];

  type Row = { t: string; o: number; h: number; l: number; c: number; v: number; ac: number };
  const byDate = new Map<string, Row>();
  let skipped = 0;
  let fixed = 0;
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (!isPos(o) || !isPos(h) || !isPos(l) || !isPos(c)) {
      skipped++;
      continue;
    }
    const hi = Math.max(h, o, c);
    const lo = Math.min(l, o, c);
    if (hi !== h || lo !== l) fixed++;
    const vol = q.volume?.[i];
    const adj = ac[i];
    byDate.set(toDate(ts[i]!), {
      t: toDate(ts[i]!),
      o: round(o, 4),
      h: round(hi, 4),
      l: round(lo, 4),
      c: round(c, 4),
      v: typeof vol === 'number' && Number.isFinite(vol) && vol > 0 ? Math.round(vol) : 0,
      ac: round(isPos(adj) ? adj : c, 4),
    });
  }
  if (skipped > 0) warnings.push(`略過 ${skipped} 筆空值資料`);
  if (fixed > 0) warnings.push(`修正 ${fixed} 筆高低價不一致的資料`);

  let rows = [...byDate.values()].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const start = asset.historyStart;
  if (start) {
    const before = rows.length;
    rows = rows.filter((r) => r.t >= start);
    if (rows.length < before) warnings.push(`依設定只使用 ${start} 以後的資料（捨棄 ${before - rows.length} 筆較早的資料）`);
  }
  if (rows.length === 0) throw new Error('整理後沒有任何有效的 K 棒');

  const dividends: DividendEvent[] = Object.values(result.events?.dividends ?? {})
    .filter((d) => typeof d.date === 'number' && isPos(d.amount))
    .map((d) => ({ date: toDate(d.date!), amount: round(d.amount!, 6) }))
    .filter((d) => !start || d.date >= start)
    .sort((a, b) => a.date.localeCompare(b.date));
  const splits: SplitEvent[] = Object.values(result.events?.splits ?? {})
    .filter((s) => typeof s.date === 'number' && isPos(s.numerator) && isPos(s.denominator))
    .map((s) => ({ date: toDate(s.date!), numerator: s.numerator!, denominator: s.denominator! }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 最後一根是否已收盤
  const lastDate = rows[rows.length - 1]!.t;
  const today = toDate(Math.floor(now.getTime() / 1000));
  let lastBarComplete: boolean;
  if (asset.market === 'crypto') {
    lastBarComplete = lastDate < today;
  } else if (lastDate < today) {
    lastBarComplete = true;
  } else {
    const end = result.meta?.currentTradingPeriod?.regular?.end;
    lastBarComplete = typeof end === 'number' ? now.getTime() / 1000 >= end + 15 * 60 : false;
  }

  const file: AssetDataFile = {
    schemaVersion: 1,
    id: asset.id,
    symbol: asset.symbol,
    source: 'Yahoo Finance',
    currency: asset.currency,
    timezone: tz,
    updatedAt: now.toISOString(),
    lastBarComplete,
    events: { dividends, splits },
    bars: {
      t: rows.map((r) => r.t),
      o: rows.map((r) => r.o),
      h: rows.map((r) => r.h),
      l: rows.map((r) => r.l),
      c: rows.map((r) => r.c),
      v: rows.map((r) => r.v),
      ac: rows.map((r) => r.ac),
    },
  };
  return { file, warnings, currency: result.meta?.currency };
}

/** 輸出 JSON：每個欄位一行，git 的差異比較容易看 */
export function stringifyAssetFile(file: AssetDataFile): string {
  const { bars, ...meta } = file;
  const metaLines = Object.entries(meta).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const barLines = Object.entries(bars).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${metaLines.join(',\n')},\n  "bars": {\n${barLines.join(',\n')}\n  }\n}\n`;
}
