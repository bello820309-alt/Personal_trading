import { ASSETS, getAsset, type AssetConfig, type Market } from '../config/assets';
import { fxOn, type FxDataFile } from '../data/fx';
import type { Candle } from '../data/types';
import { addDays, eachDay, localTime, taipeiDate, TAIPEI, zonedTime } from './time';
import type { LabExperiment, LabFill, LabOrder } from './types';

/*
 * AI 模擬交易的記帳規則。網頁和下單指令（scripts/lab/cli.ts）共用這一份，算出來的數字一定一樣。
 *
 * 成交規則（下單時看不到成交價，和真的下「預約單」一樣）：
 * - 0050：下單後的下一個開盤（台股早上 9:00）的開盤價
 * - VOO：下單後的下一次美股開盤（紐約時間 9:30）的開盤價
 * - 比特幣：下單後的第一個 UTC 00:00（台灣早上 8:00）的價格，也就是下單那天日 K 的收盤價
 * 買進用「要花多少新台幣」下單（含手續費）；賣出用「賣掉持有的百分之幾」下單。
 * 美元計價的標的用成交日「前一天」的收盤匯率換算（成交當下一定已經知道的匯率）。
 * 手續費、交易稅用網站預設的成本設定（和回測一樣）。
 */

export interface LabMarket {
  /** 每個標的的日 K（只用資料檔裡已收盤的 K 棒，不用網頁的即時報價，網頁和指令才會算出一樣的結果） */
  candles: Record<string, Candle[]>;
  /** 美元兌新台幣匯率 */
  fx: Pick<FxDataFile, 't' | 'c'> | null;
}

/** 數量最小單位：台股 1 股（零股），VOO 0.0001 股，比特幣 0.00000001 顆（1 聰） */
export const UNIT_DECIMALS: Record<Market, number> = { tw: 0, us: 4, crypto: 8 };
const OPEN_TIME: Record<Exclude<Market, 'crypto'>, string> = { tw: '09:00', us: '09:30' };
const CLOSE_TIME: Record<Exclude<Market, 'crypto'>, string> = { tw: '13:30', us: '16:00' };

/** 這根 K 棒什麼時候收盤（UTC 毫秒） */
export function closeAt(asset: AssetConfig, date: string): number {
  if (asset.market === 'crypto') return Date.parse(`${addDays(date, 1)}T00:00:00Z`);
  return zonedTime(date, CLOSE_TIME[asset.market], asset.timezone);
}

/**
 * 只留下 nowMs 那一刻已經知道的資料（已收盤的 K 棒、已經過完那一天的匯率）。
 * 正式執行時資料本來就只有過去，這是給「假裝在某一天」的測試用，也避免不小心用到未來的資料。
 */
export function marketAt(market: LabMarket, nowMs: number): LabMarket {
  const candles: Record<string, Candle[]> = {};
  for (const [id, list] of Object.entries(market.candles)) {
    const asset = getAsset(id);
    let n = list.length;
    if (asset) while (n > 0 && closeAt(asset, list[n - 1]!.time) > nowMs) n--;
    candles[id] = n === list.length ? list : list.slice(0, n);
  }
  let fx = market.fx;
  if (fx) {
    const londonToday = localTime(nowMs, 'Europe/London').date;
    let n = fx.t.length;
    while (n > 0 && fx.t[n - 1]! >= londonToday) n--;
    if (n < fx.t.length) fx = { t: fx.t.slice(0, n), c: fx.c.slice(0, n) };
  }
  return { candles, fx };
}

/** 每筆買進至少多少新台幣 */
export const MIN_BUY = 1000;
/** 每天最多下幾筆單 */
export const MAX_ORDERS_PER_DAY = 5;

export const FILL_RULE: Record<Market, string> = {
  tw: '下一個交易日早上 9:00 的開盤價',
  us: '下一次美股開盤的開盤價（台灣時間晚上 10:30；美國夏令時間是 9:30）',
  crypto: '下一個台灣時間早上 8:00 的價格（比特幣日 K 的收盤價）',
};

const floorTo = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.floor(v * f + 1e-7) / f;
};
const roundTo = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};
const r2 = (v: number) => roundTo(v, 2);

/** 第一根「日期 ≥ date」（inclusive）或「日期 > date」的 K 棒 */
function firstFrom(candles: Candle[], date: string, inclusive: boolean): Candle | null {
  let lo = 0;
  let hi = candles.length - 1;
  let found: Candle | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = candles[mid]!.time;
    if (inclusive ? t >= date : t > date) {
      found = candles[mid]!;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found;
}

/** 最後一根「日期 ≤ date」的 K 棒 */
export function lastUpTo(candles: Candle[], date: string): Candle | null {
  let lo = 0;
  let hi = candles.length - 1;
  let found: Candle | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.time <= date) {
      found = candles[mid]!;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export interface FillPoint {
  /** 成交那根 K 棒的日期 */
  date: string;
  /** 成交時間（UTC 毫秒） */
  at: number;
  price: number;
}

/** 這筆單會在什麼時候、什麼價格成交。資料裡還沒有那根 K 棒（還沒發生或還沒更新）就是 null。 */
export function fillPoint(order: Pick<LabOrder, 'asset' | 'placedAt'>, market: LabMarket): FillPoint | null {
  const asset = getAsset(order.asset);
  const candles = market.candles[order.asset];
  if (!asset || !candles?.length) return null;
  const placed = Date.parse(order.placedAt);
  if (asset.market === 'crypto') {
    const day = new Date(placed).toISOString().slice(0, 10);
    const c = firstFrom(candles, day, true);
    if (!c) return null;
    return { date: c.time, at: Date.parse(`${addDays(c.time, 1)}T00:00:00Z`), price: c.close };
  }
  const open = OPEN_TIME[asset.market];
  const local = localTime(placed, asset.timezone);
  const c = firstFrom(candles, local.date, local.hm < open);
  if (!c) return null;
  return { date: c.time, at: zonedTime(c.time, open, asset.timezone), price: c.open };
}

export interface Holding {
  units: number;
  /** 買進成本（新台幣，含手續費），賣出時依比例扣掉 */
  costTwd: number;
  /** 買進成本（原幣，含手續費） */
  costCcy: number;
}

export interface LabState {
  cash: number;
  holdings: Record<string, Holding>;
  /** 已實現損益（新台幣） */
  realized: number;
  fees: number;
  taxes: number;
  /** 成交筆數 */
  trades: number;
}

export function initialState(capital: number): LabState {
  return { cash: capital, holdings: {}, realized: 0, fees: 0, taxes: 0, trades: 0 };
}

function unitDecimals(assetId: string): number {
  const a = getAsset(assetId);
  return a ? UNIT_DECIMALS[a.market] : 8;
}

/** 套用一筆成交紀錄（不改動原本的 state） */
export function applyFill(s: LabState, f: LabFill): LabState {
  if (f.status !== 'filled' || !f.units || f.cash === undefined) return s;
  const next: LabState = { ...s, holdings: { ...s.holdings } };
  const dp = unitDecimals(f.asset);
  const rate = f.fx ?? 1;
  const h = next.holdings[f.asset] ?? { units: 0, costTwd: 0, costCcy: 0 };
  next.cash = r2(s.cash + f.cash);
  next.fees = r2(s.fees + (f.fee ?? 0));
  next.taxes = r2(s.taxes + (f.tax ?? 0));
  next.trades = s.trades + 1;
  if (f.side === 'buy') {
    next.holdings[f.asset] = {
      units: roundTo(h.units + f.units, dp),
      costTwd: h.costTwd - f.cash,
      costCcy: h.costCcy + (f.price ?? 0) * f.units + (f.fee ?? 0) / rate,
    };
  } else {
    const frac = h.units > 0 ? Math.min(1, f.units / h.units) : 1;
    const costOut = h.costTwd * frac;
    next.realized = r2(s.realized + f.cash - costOut);
    const units = roundTo(h.units - f.units, dp);
    if (units <= 0) delete next.holdings[f.asset];
    else next.holdings[f.asset] = { units, costTwd: h.costTwd - costOut, costCcy: h.costCcy * (1 - frac) };
  }
  return next;
}

const byAt = (a: LabFill, b: LabFill) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

/** 依成交紀錄算出現在的現金與持股；until（UTC 毫秒）= 只算這個時間（含）以前成交的 */
export function stateFrom(capital: number, fills: LabFill[], until?: number): LabState {
  let s = initialState(capital);
  for (const f of [...fills].sort(byAt)) {
    if (until !== undefined && Date.parse(f.at) > until) break;
    s = applyFill(s, f);
  }
  return s;
}

function rejected(order: LabOrder, point: FillPoint, settledAt: string, note: string): LabFill {
  return {
    orderId: order.id,
    status: 'rejected',
    asset: order.asset,
    side: order.side,
    date: point.date,
    at: new Date(point.at).toISOString(),
    note,
    settledAt,
  };
}

/**
 * 算出一筆單的成交結果。需要的匯率還沒有時回傳 null（下次再算）。
 * state = 成交當下的現金與持股（同一個標的的單，依成交時間先後處理）。
 */
export function computeFill(order: LabOrder, point: FillPoint, state: LabState, market: LabMarket, settledAt: string): LabFill | null {
  const asset = getAsset(order.asset);
  if (!asset) return rejected(order, point, settledAt, `沒有這個標的：${order.asset}`);
  let rate = 1;
  let fxDate: string | undefined;
  if (asset.currency === 'USD') {
    const fx = market.fx ? fxOn(market.fx, new Date(point.at).toISOString().slice(0, 10), true) : null;
    if (!fx) return null;
    rate = fx.rate;
    fxDate = fx.date;
  }
  const dp = UNIT_DECIMALS[asset.market];
  const fr = asset.costs.feeRate * asset.costs.feeDiscount;
  const minFee = asset.costs.minFee;
  const p = point.price;
  /** 手續費（原幣）：台股無條件捨去到元，最低 minFee */
  const feeOf = (units: number) => {
    if (units <= 0) return 0;
    const raw = units * p * fr;
    return Math.max(minFee, asset.market === 'tw' ? Math.floor(raw) : raw);
  };
  const base = {
    orderId: order.id,
    status: 'filled' as const,
    asset: order.asset,
    side: order.side,
    date: point.date,
    at: new Date(point.at).toISOString(),
    price: p,
    ...(asset.currency === 'USD' ? { fx: rate, fxDate } : {}),
    settledAt,
  };

  if (order.side === 'buy') {
    const amount = order.amount ?? 0;
    if (amount <= 0) return rejected(order, point, settledAt, '買進金額不正確');
    if (state.cash + 0.01 < amount) return rejected(order, point, settledAt, `現金不足（剩 ${Math.floor(state.cash).toLocaleString('en-US')} 元）`);
    const budget = amount / rate;
    let units = floorTo(budget / (p * (1 + fr)), dp);
    if (units > 0 && units * p + feeOf(units) > budget) units = floorTo((budget - minFee) / p, dp);
    if (units > 0 && units * p + feeOf(units) > budget) units = 0;
    if (units <= 0) return rejected(order, point, settledAt, asset.market === 'tw' ? '金額太小，買不到 1 股' : '金額太小，買不到');
    const value = r2(units * p * rate);
    const fee = r2(feeOf(units) * rate);
    return { ...base, units, value, fee, tax: 0, cash: -Math.min(amount, r2(value + fee)) };
  }

  const held = state.holdings[order.asset]?.units ?? 0;
  if (held <= 0) return rejected(order, point, settledAt, '沒有持股可以賣');
  const pct = Math.min(100, Math.max(0, order.pct ?? 0));
  if (pct <= 0) return rejected(order, point, settledAt, '賣出比例不正確');
  const units = pct >= 100 ? held : Math.min(held, floorTo((held * pct) / 100, dp));
  if (units <= 0) return rejected(order, point, settledAt, '持股太少，賣不到 1 股');
  const gross = units * p;
  const feeCcy = feeOf(units);
  const rawTax = gross * asset.costs.sellTaxRate;
  const taxCcy = asset.market === 'tw' ? Math.floor(rawTax) : rawTax;
  const value = r2(gross * rate);
  const fee = r2(Math.min(gross, feeCcy) * rate);
  const tax = r2(taxCcy * rate);
  return { ...base, units, value, fee, tax, cash: r2(Math.max(0, value - fee - tax)) };
}

/**
 * 結算：把還沒成交、但資料裡已經有成交那根 K 棒的單算出成交結果。
 * 只回傳「新的」成交紀錄（已經算過的不會重算，之後資料就算被修正也不會改變過去的成交）。
 */
export function settleOrders(orders: LabOrder[], fills: LabFill[], market: LabMarket, capital: number, settledAt: string): LabFill[] {
  const done = new Set(fills.map((f) => f.orderId));
  let state = stateFrom(capital, fills);
  const ready = orders
    .filter((o) => !o.cancelledAt && !done.has(o.id))
    .map((o) => ({ o, p: fillPoint(o, market) }))
    .filter((x): x is { o: LabOrder; p: FillPoint } => x.p !== null)
    .sort((a, b) => a.p.at - b.p.at || a.o.placedAt.localeCompare(b.o.placedAt));
  const out: LabFill[] = [];
  for (const { o, p } of ready) {
    const f = computeFill(o, p, state, market, settledAt);
    if (!f) continue;
    out.push(f);
    state = applyFill(state, f);
  }
  return out;
}

/** 還沒成交的單（沒有取消、也還沒有成交紀錄） */
export function pendingOrders(orders: LabOrder[], fills: LabFill[]): LabOrder[] {
  const done = new Set(fills.map((f) => f.orderId));
  return orders.filter((o) => !o.cancelledAt && !done.has(o.id));
}

/** 現在還能拿來下買單的現金 = 現金 − 還沒成交的買單金額（賣單成交前，賣出的錢還不能用） */
export function availableCash(capital: number, orders: LabOrder[], fills: LabFill[]): number {
  const s = stateFrom(capital, fills);
  const reserved = pendingOrders(orders, fills)
    .filter((o) => o.side === 'buy')
    .reduce((sum, o) => sum + (o.amount ?? 0), 0);
  return r2(s.cash - reserved);
}

export interface HoldingView {
  asset: AssetConfig;
  units: number;
  /** 估值用的價格（原幣）與日期 */
  price: number;
  priceDate: string;
  /** 美元計價的匯率；台幣計價是 1 */
  rate: number;
  value: number;
  costTwd: number;
  /** 平均成本（原幣／單位，含手續費） */
  avgCost: number;
  pnl: number;
  pnlPct: number;
}

export interface Valuation {
  value: number;
  cash: number;
  holdings: HoldingView[];
}

/** 用 date（台灣日期）當天或之前最近的收盤價估算總資產 */
export function valueAt(state: LabState, market: LabMarket, date: string): Valuation {
  const holdings: HoldingView[] = [];
  let value = state.cash;
  for (const [id, h] of Object.entries(state.holdings)) {
    const asset = getAsset(id);
    const candles = market.candles[id];
    if (!asset || !candles?.length || h.units <= 0) continue;
    const c = lastUpTo(candles, date) ?? candles[0]!;
    let rate = 1;
    if (asset.currency === 'USD' && market.fx?.t.length) rate = (fxOn(market.fx, date) ?? { rate: market.fx.c[0]! }).rate;
    const v = h.units * c.close * rate;
    value += v;
    holdings.push({
      asset,
      units: h.units,
      price: c.close,
      priceDate: c.time,
      rate,
      value: v,
      costTwd: h.costTwd,
      avgCost: h.costCcy / h.units,
      pnl: v - h.costTwd,
      pnlPct: h.costTwd > 0 ? v / h.costTwd - 1 : 0,
    });
  }
  const order = (id: string) => ASSETS.findIndex((a) => a.id === id);
  holdings.sort((a, b) => order(a.asset.id) - order(b.asset.id));
  return { value, cash: state.cash, holdings };
}

export interface EquityPoint {
  time: string;
  value: number;
}

/** 每天的總資產（台灣日期，含週末：比特幣週末也會動）。from 那天還沒有任何成交，就是本金。 */
export function equitySeries(capital: number, fills: LabFill[], market: LabMarket, from: string, to: string): EquityPoint[] {
  const sorted = fills.filter((f) => f.status === 'filled').sort(byAt);
  let s = initialState(capital);
  let i = 0;
  const out: EquityPoint[] = [];
  for (const d of eachDay(from, to)) {
    while (i < sorted.length && taipeiDate(Date.parse(sorted[i]!.at)) <= d) s = applyFill(s, sorted[i++]!);
    out.push({ time: d, value: valueAt(s, market, d).value });
  }
  return out;
}

/** 實驗的第幾天（第一個操作日 = 1）；開始前是 0 */
export function dayNumber(exp: LabExperiment, date: string): number {
  if (date < exp.start) return 0;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${exp.start}T00:00:00Z`)) / 86400000) + 1;
}

export type LabPhase = 'before' | 'running' | 'wrapup' | 'done';

export function phaseOf(exp: LabExperiment, date: string): LabPhase {
  if (date < exp.start) return 'before';
  if (date <= exp.end) return 'running';
  if (date <= exp.wrapUp) return 'wrapup';
  return 'done';
}

/** 實驗第一天、每天操作時間的那一刻（UTC 毫秒） */
export function firstRunAt(exp: LabExperiment): number {
  return zonedTime(exp.start, exp.runTime, TAIPEI);
}

/** 對照組的買單：第一天操作時間，照比例把本金買進每個標的，之後不動 */
export function benchmarkOrders(exp: LabExperiment): LabOrder[] {
  const placedAt = new Date(firstRunAt(exp)).toISOString();
  return Object.entries(exp.benchmark.weights)
    .filter(([, w]) => w > 0)
    .map(([asset, w], i) => ({
      id: `bench-${i + 1}`,
      placedAt,
      day: exp.start,
      asset,
      side: 'buy' as const,
      amount: Math.floor(exp.capital * w),
      reason: exp.benchmark.intro,
    }));
}

export interface Standing {
  value: number;
  cash: number;
  returnPct: number;
  state: LabState;
  valuation: Valuation;
}

/** 某一天的成績 */
export function standing(capital: number, fills: LabFill[], market: LabMarket, date: string, until?: number): Standing {
  const state = stateFrom(capital, fills, until);
  const valuation = valueAt(state, market, date);
  return { value: valuation.value, cash: state.cash, returnPct: valuation.value / capital - 1, state, valuation };
}
