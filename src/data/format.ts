import type { AssetConfig } from '../config/assets';

const numberFormats = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: min, maximumFractionDigits: max });
    numberFormats.set(key, f);
  }
  return f;
}

const compactFormat = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 });

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return nf(digits, digits).format(v);
}

/** 依數值大小自動決定小數位數（給指標數值用） */
export function fmtAuto(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 10000) return nf(0, 0).format(v);
  if (a >= 100) return nf(1, 1).format(v);
  if (a >= 1) return nf(2, 2).format(v);
  return nf(3, 3).format(v);
}

/** 比例轉百分比：0.0123 → +1.23% */
export function fmtPct(v: number | null | undefined, digits = 2, withSign = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = nf(digits, digits).format(v * 100);
  return `${withSign && v > 0 ? '+' : ''}${s}%`;
}

/** 數值本身就是百分比：12.3 → +12.30% */
export function fmtPctValue(v: number | null | undefined, digits = 2, withSign = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return fmtPct(v / 100, digits, withSign);
}

export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return compactFormat.format(v);
}

export function fmtPrice(v: number | null | undefined, asset: AssetConfig): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const digits = asset.market === 'crypto' && Math.abs(v) >= 1000 ? 0 : asset.pricePrecision;
  return nf(digits, digits).format(v);
}

export function fmtMoney(v: number | null | undefined, asset: AssetConfig, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${asset.currencySymbol}${nf(digits, digits).format(v)}`;
}

/** 成交量依標的換算單位（台股顯示「張」） */
export function fmtVolume(v: number | null | undefined, asset: AssetConfig): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const scaled = v / asset.volume.divisor;
  return `${Math.abs(scaled) >= 10000 ? fmtCompact(scaled) : nf(0, 0).format(scaled)} ${asset.volume.unit}`;
}

/** 2026-10-31 → 2026/10/31 */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d.replaceAll('-', '/');
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

const clockFormat = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 毫秒時間 → 「11/02 13:11」（使用裝置的時區） */
export function fmtClock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  return clockFormat.format(new Date(ms));
}

/** K 棒的日期；週 K、月 K 顯示區間，例如 2026/10/26～11/01 */
export function fmtBarDate(time: string, endTime?: string): string {
  if (!endTime || endTime === time) return fmtDate(time);
  return `${fmtDate(time)}～${fmtDate(endTime).slice(endTime.slice(0, 4) === time.slice(0, 4) ? 5 : 0)}`;
}

/** 兩個 YYYY-MM-DD 之間相差幾天 */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function signClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0 || !Number.isFinite(v)) return 'text-muted';
  return v > 0 ? 'text-up' : 'text-down';
}
