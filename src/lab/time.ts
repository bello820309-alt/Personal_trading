/* 時區換算的小工具（不依賴執行環境的時區設定） */

export const TAIPEI = 'Asia/Taipei';

const formats = new Map<string, Intl.DateTimeFormat>();

function partsOf(ms: number, tz: string): Record<string, number> {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formats.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

export interface LocalTime {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM（24 小時制） */
  hm: string;
}

/** UTC 毫秒 → 某個時區的當地日期與時間 */
export function localTime(ms: number, tz: string): LocalTime {
  const p = partsOf(ms, tz);
  return { date: `${p.year}-${pad(p.month!)}-${pad(p.day!)}`, hm: `${pad(p.hour!)}:${pad(p.minute!)}` };
}

function offsetMs(ms: number, tz: string): number {
  const p = partsOf(ms, tz);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** 某個時區的當地日期與時間 → UTC 毫秒（會處理夏令時間） */
export function zonedTime(date: string, hm: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!);
  let t = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(t, tz);
  if (second !== t) t = second;
  return t;
}

/** 台灣日期 */
export function taipeiDate(ms: number): string {
  return localTime(ms, TAIPEI).date;
}

/** YYYY-MM-DD 加減天數 */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/** 兩個日期之間的每一天（含頭尾） */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 2026-11-04 → 11/4（三） */
export function shortDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  const w = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${m}/${d}（${WEEKDAYS[w]}）`;
}
