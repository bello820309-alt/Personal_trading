import type { Candle } from '../data/types';
import { indexRange } from '../data/range';

/** 策略排行榜可以快速選的期間 */
export interface PeriodPreset {
  key: string;
  label: string;
  from: string;
  to: string;
  group: 'recent' | 'year' | 'phase';
}

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 區間內收盤價最高（或最低）的那一天；區間沒有資料時回傳 null */
export function extremeDate(candles: readonly Candle[], from: string, to: string, kind: 'max' | 'min'): string | null {
  const r = indexRange(candles, from, to);
  if (!r) return null;
  let best = r.start;
  for (let i = r.start + 1; i <= r.end; i++) {
    const c = candles[i]!.close;
    if (kind === 'max' ? c > candles[best]!.close : c < candles[best]!.close) best = i;
  }
  return candles[best]!.time;
}

type Anchor = { date: string } | { peak: [string, string] } | { trough: [string, string] };

/**
 * 比特幣幾段有名的大漲、大跌行情。起訖日不是寫死的，而是在指定的時間範圍裡
 * 找「收盤價最高／最低的那一天」，所以一定和資料一致。
 */
const BTC_PHASES: { key: string; label: string; from: Anchor; to: Anchor }[] = [
  { key: 'bull2017', label: '2017 大牛市', from: { date: '2017-01-01' }, to: { peak: ['2017-06-01', '2018-02-28'] } },
  { key: 'bear2018', label: '2018 熊市', from: { peak: ['2017-06-01', '2018-02-28'] }, to: { trough: ['2018-06-01', '2019-03-31'] } },
  { key: 'bull2020', label: '2020–21 大牛市', from: { trough: ['2020-02-01', '2020-04-30'] }, to: { peak: ['2021-01-01', '2022-01-31'] } },
  { key: 'bear2022', label: '2022 熊市', from: { peak: ['2021-01-01', '2022-01-31'] }, to: { trough: ['2022-09-01', '2023-01-31'] } },
  { key: 'bull2023', label: '2023–24 回升', from: { trough: ['2022-09-01', '2023-01-31'] }, to: { peak: ['2024-01-01', '2024-06-30'] } },
];

function resolveAnchor(candles: readonly Candle[], a: Anchor): string | null {
  if ('date' in a) return a.date;
  if ('peak' in a) return extremeDate(candles, a.peak[0], a.peak[1], 'max');
  return extremeDate(candles, a.trough[0], a.trough[1], 'min');
}

export function buildPresets(candles: readonly Candle[], assetId: string): PeriodPreset[] {
  if (!candles.length) return [];
  const first = candles[0]!.time;
  const last = candles[candles.length - 1]!.time;
  const lastMs = Date.parse(`${last}T00:00:00Z`);
  const out: PeriodPreset[] = [];
  for (const [key, label, years] of [
    ['1Y', '近 1 年', 1],
    ['2Y', '近 2 年', 2],
    ['3Y', '近 3 年', 3],
    ['5Y', '近 5 年', 5],
  ] as const) {
    const from = iso(lastMs - Math.round(years * 365.25) * DAY + DAY);
    if (from > first) out.push({ key, label, from, to: last, group: 'recent' });
  }
  out.push({ key: 'ALL', label: '全部資料', from: first, to: last, group: 'recent' });

  const y0 = Number(first.slice(0, 4)) + (first.slice(5) <= '01-10' ? 0 : 1);
  const y1 = Number(last.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    out.push({
      key: `Y${y}`,
      label: y === y1 && last.slice(5) < '12-24' ? `${y}（今年）` : String(y),
      from: `${y}-01-01`,
      to: y === y1 ? last : `${y}-12-31`,
      group: 'year',
    });
  }

  if (assetId === 'BTC') {
    for (const p of BTC_PHASES) {
      const from = resolveAnchor(candles, p.from);
      const to = resolveAnchor(candles, p.to);
      if (from && to && from >= first && to <= last && from < to) out.push({ key: p.key, label: p.label, from, to, group: 'phase' });
    }
  }
  return out;
}
