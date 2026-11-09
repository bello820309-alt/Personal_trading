import { fmtPct } from '../data/format';
import type { Candle } from '../data/types';
import { REGIME_LABELS, regimeAt, type EventGroup, type MarketEvent, type Regime } from '../data/events';
import type { IndicatorDef } from '../indicators/types';
import { runBacktest, type BacktestConfig } from './engine';
import { MIN_TRADES, type Prepared } from './rank';

/*
 * 事件前後的表現：都從「事件前一天的收盤價」算起，
 * - 事件前 7 天：前 8 天收盤 → 前 1 天收盤（事件前的走勢）
 * - 事件後 1／7／30 天：前 1 天收盤 → 事件後第 N 天收盤（包含事件當天的反應）
 * 日期用日曆天；股票遇到休市就用那天之前最近的一根 K 棒。
 */

export const WINDOWS = ['before7', 'after1', 'after7', 'after30'] as const;
export type WindowKey = (typeof WINDOWS)[number];

export const WINDOW_LABELS: Record<WindowKey, string> = {
  before7: '事件前 7 天',
  after1: '事件後 1 天',
  after7: '事件後 7 天',
  after30: '事件後 30 天',
};

const DAY = 86400000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** 日期 ≤ date 的最後一根 K 棒；沒有時回傳 -1 */
export function barAtOrBefore(candles: readonly Candle[], date: string): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.time <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export type WindowReturns = Record<WindowKey, number | null>;

/** 假設某一天發生事件，計算前後各段的漲跌；資料還沒到的部分是 null */
export function windowReturns(candles: readonly Candle[], date: string): WindowReturns | null {
  if (!candles.length) return null;
  const lastTime = candles[candles.length - 1]!.time;
  const base = barAtOrBefore(candles, addDays(date, -1));
  if (base < 0) return null;
  const baseClose = candles[base]!.close;
  const after = (days: number) => {
    const target = addDays(date, days);
    if (target > lastTime) return null;
    const i = barAtOrBefore(candles, target);
    return i > base ? candles[i]!.close / baseClose - 1 : null;
  };
  const pre = barAtOrBefore(candles, addDays(date, -8));
  return {
    before7: pre >= 0 && pre < base ? baseClose / candles[pre]!.close - 1 : null,
    after1: after(1),
    after7: after(7),
    after30: after(30),
  };
}

export interface EventRow {
  event: MarketEvent;
  returns: WindowReturns;
  /** 還有期間沒到時：從事件前一天收盤到最新收盤，目前漲跌多少 */
  sofar?: { ret: number; date: string };
}

/** 資料範圍內的事件，以及每個事件前後的漲跌 */
export function eventRows(candles: readonly Candle[], events: readonly MarketEvent[]): EventRow[] {
  if (!candles.length) return [];
  const first = candles[0]!.time;
  const last = candles[candles.length - 1]!.time;
  const out: EventRow[] = [];
  for (const event of events) {
    if (event.date <= first || event.date > last) continue;
    const returns = windowReturns(candles, event.date);
    if (!returns) continue;
    const row: EventRow = { event, returns };
    if (returns.after1 === null || returns.after7 === null || returns.after30 === null) {
      const base = barAtOrBefore(candles, addDays(event.date, -1));
      const lastIdx = candles.length - 1;
      if (base >= 0 && lastIdx > base) row.sofar = { ret: candles[lastIdx]!.close / candles[base]!.close - 1, date: candles[lastIdx]!.time };
    }
    out.push(row);
  }
  return out;
}

export interface WindowStats {
  /** 有資料的事件數 */
  n: number;
  avg: number | null;
  median: number | null;
  /** 上漲的比例 */
  upRatio: number | null;
}

export function windowStats(values: (number | null)[]): WindowStats {
  const xs = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return { n: 0, avg: null, median: null, upRatio: null };
  const mid = n >> 1;
  return {
    n,
    avg: xs.reduce((a, b) => a + b, 0) / n,
    median: n % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2,
    upRatio: xs.filter((x) => x > 0).length / n,
  };
}

export type GroupStats = Record<WindowKey, WindowStats>;

export function groupStats(rows: readonly EventRow[]): GroupStats {
  return Object.fromEntries(WINDOWS.map((w) => [w, windowStats(rows.map((r) => r.returns[w]))])) as GroupStats;
}

/** 對照組：把「每一天」都當成事件日，看平常的日子前後會怎麼走 */
export function baselineStats(candles: readonly Candle[]): GroupStats {
  const rows: EventRow[] = [];
  for (let i = 8; i < candles.length; i++) {
    const returns = windowReturns(candles, candles[i]!.time);
    if (returns) rows.push({ event: { date: candles[i]!.time, group: 'macro', title: '' }, returns });
  }
  return groupStats(rows);
}

export function rowsByGroup(rows: readonly EventRow[]): Map<EventGroup, EventRow[]> {
  const m = new Map<EventGroup, EventRow[]>();
  for (const r of rows) {
    const list = m.get(r.event.group) ?? [];
    list.push(r);
    m.set(r.event.group, list);
  }
  return m;
}

export interface RegimeRow {
  def: IndicatorDef;
  trades: number;
  wins: number;
  winRate: number | null;
  avgReturn: number | null;
}

export interface RegimeRanking {
  regime: Regime;
  /** 這種環境占全部 K 棒的比例 */
  share: number;
  bars: number;
  /** 這種環境下一直抱著的年化報酬（把這些日子的漲跌連乘後換算成一年） */
  holdAnnualized: number | null;
  /** 依勝率排序；交易次數夠的在前 */
  rows: RegimeRow[];
}

const REGIMES: Regime[] = ['hiking', 'cutting', 'steady'];

/**
 * 不同利率環境下，各策略的勝率：用全部資料回測一次，
 * 每筆交易依「買進那天」屬於哪一種利率環境歸類。
 */
export function rankByRegime(prep: Prepared, cfg: BacktestConfig): RegimeRanking[] {
  const c = prep.candles;
  const last = c.length - 1;
  if (last < 1) return [];
  const regimes = c.map((x) => regimeAt(x.time));
  const tally = new Map<Regime, Map<string, { def: IndicatorDef; rets: number[] }>>(REGIMES.map((r) => [r, new Map()]));
  for (const { def, signals } of prep.strategies) {
    const res = runBacktest(c, signals, 0, last, cfg, prep.ppy);
    for (const t of res.trades) {
      if (t.open) continue;
      const m = tally.get(regimes[t.entryIndex]!)!;
      const e = m.get(def.id) ?? { def, rets: [] };
      e.rets.push(t.returnPct);
      m.set(def.id, e);
    }
  }
  return REGIMES.map((regime) => {
    let bars = 0;
    let growth = 1;
    for (let i = 1; i <= last; i++) {
      if (regimes[i] !== regime) continue;
      bars++;
      growth *= c[i]!.close / c[i - 1]!.close;
    }
    const rows = [...tally.get(regime)!.values()].map(({ def, rets }) => {
      const wins = rets.filter((r) => r > 0).length;
      return {
        def,
        trades: rets.length,
        wins,
        winRate: rets.length ? wins / rets.length : null,
        avgReturn: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
      };
    });
    rows.sort(
      (a, b) =>
        Number(b.trades >= MIN_TRADES) - Number(a.trades >= MIN_TRADES) ||
        (b.winRate ?? -1) - (a.winRate ?? -1) ||
        b.trades - a.trades,
    );
    return {
      regime,
      share: bars / last,
      bars,
      holdAnnualized: bars >= 30 ? growth ** (prep.ppy / bars) - 1 : null,
      rows,
    };
  });
}

/** 事件前後表現的白話說明（和「平常的日子」比較） */
export function summarizeEventGroup(label: string, stats: GroupStats, base: GroupStats, assetName: string, group?: EventGroup): string[] {
  const s = stats.after7;
  const b = base.after7;
  if (s.n === 0 || s.avg === null || b.avg === null || s.upRatio === null || b.upRatio === null) {
    return ['這類事件在資料範圍內，還沒有足夠的後續資料可以統計。'];
  }
  const out: string[] = [];
  out.push(
    `過去 ${s.n} 次「${label}」之後 7 天，${assetName}平均 ${fmtPct(s.avg)}（中位數 ${fmtPct(s.median)}），上漲的比例是 ${fmtPct(s.upRatio, 0, false)}。`,
  );
  out.push(`對照平常的日子：隨便挑一天，之後 7 天平均 ${fmtPct(b.avg)}，上漲的比例是 ${fmtPct(b.upRatio, 0, false)}。`);
  const dAvg = s.avg - b.avg;
  const dUp = s.upRatio - b.upRatio;
  if (Math.abs(dAvg) < 0.01 && Math.abs(dUp) < 0.08) {
    out.push('兩者差不多：這類事件之後的一週，並沒有特別容易漲或跌。很多消息市場早就預期到了，公布時反應不一定大。');
  } else if (dAvg > 0 && dUp >= 0) {
    out.push('這類事件之後比平常更常上漲、平均也比較好；但這是過去的統計，每一次的情況都不一樣。');
  } else if (dAvg < 0 && dUp <= 0) {
    out.push('這類事件之後比平常更常下跌、平均也比較差；但這是過去的統計，每一次的情況都不一樣。');
  } else {
    out.push('平均和上漲比例的方向不一致：通常是少數幾次特別大的漲跌把平均拉偏了，看中位數和下面每一次的結果比較準。');
  }
  const s30 = stats.after30;
  const b30 = base.after30;
  if (s30.n > 0) {
    out.push(
      `拉長到 30 天：平均 ${fmtPct(s30.avg)}、上漲比例 ${fmtPct(s30.upRatio, 0, false)}（平常的日子：${fmtPct(b30.avg)}、${fmtPct(b30.upRatio, 0, false)}）。`,
    );
  }
  if (group === 'crypto' || group === 'macro') {
    out.push('注意：這類「大事」是事後挑出來的重大新聞，其中不少本身就是崩盤或恐慌，所以統計偏向下跌很正常，不能拿來預測下一次。');
  }
  if (s.n < 8) out.push(`只有 ${s.n} 次，樣本太少，很容易被單一事件左右，參考就好。`);
  return out;
}

export function summarizeRegimes(list: RegimeRanking[]): string[] {
  const out: string[] = [];
  for (const r of list) {
    const top = r.rows.find((x) => x.trades >= MIN_TRADES);
    const hold = r.holdAnnualized === null ? '' : `這種環境下一直抱著，換算年化 ${fmtPct(r.holdAnnualized)}；`;
    out.push(
      `${REGIME_LABELS[r.regime]}（占 ${fmtPct(r.share, 0, false)} 的時間）：${hold}` +
        (top ? `勝率最高的是「${top.def.name}」（${top.trades} 筆、勝率 ${fmtPct(top.winRate, 0, false)}）。` : `沒有策略在這種環境下完成 ${MIN_TRADES} 筆以上的交易。`),
    );
  }
  out.push('同一個策略在不同的利率環境下，勝率可能差很多；不過每種環境裡的交易次數不多，結論只能當作參考。');
  return out;
}

/** 一段期間（K 棒位置）裡，三種利率環境各占多少比例 */
export function regimeShares(candles: readonly Candle[], start: number, end: number): Record<Regime, number> {
  const out: Record<Regime, number> = { hiking: 0, cutting: 0, steady: 0 };
  const n = end - start + 1;
  if (n <= 0) return out;
  for (let i = start; i <= end; i++) out[regimeAt(candles[i]!.time)] += 1 / n;
  return out;
}
