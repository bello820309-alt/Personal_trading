import type { FxDataFile } from '../../src/data/fx.ts';
import { dateFormatter } from './normalize.ts';

/*
 * 美元兌新台幣匯率（Yahoo 代號 TWD=X：1 美元可以換多少新台幣）。
 * 只用每天的收盤匯率，給「AI 模擬交易」把美元計價的 VOO、比特幣換算成台幣。
 */

export const FX_SYMBOL = 'TWD=X';
export const FX_ID = 'USDTWD';
/** 只保留這一天以後的資料（夠用，檔案也比較小） */
export const FX_START = '2010-01-01';
/** 合理範圍：超出就當成資料錯誤 */
const MIN_RATE = 20;
const MAX_RATE = 50;
/** 某一天比前後兩天都高（或都低）超過這個幅度，視為報價錯誤，略過 */
const SPIKE = 0.05;
/** 整理後仍有單日變動超過這個幅度，就拒絕更新 */
const MAX_JUMP = 0.1;

interface YahooFxResult {
  meta?: { currency?: string; exchangeTimezoneName?: string };
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[] }[] };
}

export interface FxNormalizeResult {
  file: FxDataFile;
  warnings: string[];
  currency: string | undefined;
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * 整理 Yahoo 的匯率回應：
 * - 時間換成報價時區的日期，同一天重複時保留最後一筆
 * - 只存「已經過完」的日子（今天的匯率還在變，存了只會每小時產生 commit）
 * - 拿掉明顯的錯誤報價（突然跳上去又跳回來）
 */
export function normalizeFx(json: unknown, now: Date): FxNormalizeResult {
  const result = (json as { chart?: { result?: YahooFxResult[] } })?.chart?.result?.[0];
  if (!result) throw new Error('回應裡沒有 chart.result');
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  if (ts.length === 0) throw new Error('回應裡沒有匯率資料');
  const tz = result.meta?.exchangeTimezoneName || 'Europe/London';
  const toDate = dateFormatter(tz);
  const today = toDate(Math.floor(now.getTime() / 1000));
  const warnings: string[] = [];

  const byDate = new Map<string, number>();
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue;
    const d = toDate(ts[i]!);
    if (d < FX_START || d >= today) continue;
    byDate.set(d, round4(c));
  }
  let rows = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const outOfRange = rows.filter(([, c]) => c < MIN_RATE || c > MAX_RATE).length;
  if (outOfRange > 0) {
    rows = rows.filter(([, c]) => c >= MIN_RATE && c <= MAX_RATE);
    warnings.push(`略過 ${outOfRange} 筆不合理的匯率（不在 ${MIN_RATE}～${MAX_RATE} 之間）`);
  }

  const spikes: string[] = [];
  rows = rows.filter((row, i) => {
    const prev = rows[i - 1];
    const next = rows[i + 1];
    if (!prev || !next) return true;
    const up = row[1] / prev[1] - 1;
    const back = next[1] / row[1] - 1;
    const spike = Math.abs(up) > SPIKE && Math.abs(back) > SPIKE && Math.sign(up) !== Math.sign(back);
    if (spike) spikes.push(row[0]);
    return !spike;
  });
  if (spikes.length) warnings.push(`略過 ${spikes.length} 筆跳上去又跳回來的錯誤報價：${spikes.slice(0, 5).join('、')}`);
  if (rows.length === 0) throw new Error('整理後沒有任何有效的匯率');

  return {
    file: {
      schemaVersion: 1,
      id: FX_ID,
      symbol: FX_SYMBOL,
      source: 'Yahoo Finance',
      description: '1 美元可以換多少新台幣（每天的收盤匯率）',
      timezone: tz,
      updatedAt: now.toISOString(),
      t: rows.map((r) => r[0]),
      c: rows.map((r) => r[1]),
    },
    warnings,
    currency: result.meta?.currency,
  };
}

/** 寫入前的檢查；有 errors 就保留上一版 */
export function validateFx(file: FxDataFile, prev: FxDataFile | null, reportedCurrency?: string): string[] {
  const errors: string[] = [];
  const { t, c } = file;
  if (reportedCurrency && reportedCurrency.toUpperCase() !== 'TWD') errors.push(`幣別不符：應該是 TWD，Yahoo 回報 ${reportedCurrency}`);
  if (t.length !== c.length) errors.push('日期和匯率的數量不一致');
  if (t.length < 250) errors.push(`資料太少（${t.length} 筆），可能抓取不完整`);
  const jumps: string[] = [];
  for (let i = 1; i < c.length; i++) {
    if (t[i]! <= t[i - 1]!) {
      errors.push(`日期沒有遞增：${t[i - 1]} → ${t[i]}`);
      break;
    }
    const r = c[i]! / c[i - 1]! - 1;
    if (Math.abs(r) > MAX_JUMP) jumps.push(`${t[i]}（${(r * 100).toFixed(1)}%）`);
  }
  if (jumps.length) errors.push(`單日變動超過 ${MAX_JUMP * 100}%：${jumps.slice(0, 5).join('、')}`);
  if (prev && prev.t.length > 0 && t.length < prev.t.length * 0.98 - 5) {
    errors.push(`歷史資料變少了（上一版 ${prev.t.length} 筆，這次 ${t.length} 筆）`);
  }
  return errors;
}

export function sameFx(a: FxDataFile, b: FxDataFile): boolean {
  return a.t.length === b.t.length && a.t.every((d, i) => d === b.t[i] && a.c[i] === b.c[i]);
}

export function stringifyFx(file: FxDataFile): string {
  const { t, c, ...meta } = file;
  const metaLines = Object.entries(meta).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${metaLines.join(',\n')},\n  "t": ${JSON.stringify(t)},\n  "c": ${JSON.stringify(c)}\n}\n`;
}
