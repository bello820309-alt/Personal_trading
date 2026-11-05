import type { Candle } from '../data/types';

/*
 * 動態定投（價格階梯）：
 * 固定的時間（例如每週）看一次價格，依照價格落在哪一階決定這一期要做什麼：
 * 跌越多買越多、漲越多買越少，漲到很高就開始賣出。
 * 一般定投（每期固定金額、不賣）當作對照。
 */

export type Cadence = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export const CADENCES: Cadence[] = ['daily', 'weekly', 'biweekly', 'monthly'];
export const CADENCE_LABELS: Record<Cadence, string> = { daily: '每天', weekly: '每週', biweekly: '每兩週', monthly: '每月' };
/** 「這一期」的說法 */
export const CADENCE_NOW: Record<Cadence, string> = { daily: '今天', weekly: '這週', biweekly: '這一期（兩週）', monthly: '這個月' };

export type DcaAction = { kind: 'buy'; amount: number } | { kind: 'sell'; pct: number } | { kind: 'hold' };

/** 價格階梯的一階：門檻高於基準價格是「漲到」，低於基準價格是「跌到」 */
export interface LadderRule {
  price: number;
  action: DcaAction;
}

/** every：價格停在賣出區時每一期都賣；once：每個價位只賣一次，價格跌回基準價格以下才重新啟動 */
export type SellMode = 'every' | 'once';

export interface DcaPlan {
  basePrice: number;
  /** 價格在基準附近（沒有碰到任何門檻）時每期買的金額 */
  baseAmount: number;
  cadence: Cadence;
  sellMode: SellMode;
  rules: LadderRule[];
  /** 基準價格是哪一天設定的（YYYY-MM-DD）；預設的階梯用那天的收盤價當基準 */
  setOn?: string;
}

export interface DcaCosts {
  /** 買、賣各收一次的手續費率（已含折扣） */
  feeRate: number;
  /** 賣出時的交易稅率 */
  sellTaxRate: number;
}

export interface Zone {
  /** 套用的規則在 plan.rules 裡的位置（-1 = 基準區間，用基本金額） */
  ruleIndex: number;
  action: DcaAction;
}

export const isAbove = (plan: DcaPlan, r: LadderRule) => r.price > plan.basePrice;
export const isBelow = (plan: DcaPlan, r: LadderRule) => r.price < plan.basePrice;

/**
 * 價格落在哪一階：
 * 漲到的規則取「已經碰到、門檻最高」的那一階；跌到的規則取「已經碰到、門檻最低」的那一階；
 * 都沒碰到就是基準區間。碰到門檻（等於）就算。
 */
export function zoneAt(plan: DcaPlan, price: number): Zone {
  let best = -1;
  plan.rules.forEach((r, i) => {
    if (isAbove(plan, r) && price >= r.price) {
      if (best < 0 || r.price > plan.rules[best]!.price) best = i;
    } else if (isBelow(plan, r) && price <= r.price) {
      if (best < 0 || r.price < plan.rules[best]!.price) best = i;
    }
  });
  if (best < 0) return { ruleIndex: -1, action: { kind: 'buy', amount: plan.baseAmount } };
  return { ruleIndex: best, action: plan.rules[best]!.action };
}

/** 基準區間的上下界：最接近基準價格的「跌到」門檻與「漲到」門檻（沒有就是 null） */
export function baseBounds(plan: DcaPlan): { low: number | null; high: number | null } {
  let low: number | null = null;
  let high: number | null = null;
  for (const r of plan.rules) {
    if (isBelow(plan, r) && (low === null || r.price > low)) low = r.price;
    if (isAbove(plan, r) && (high === null || r.price < high)) high = r.price;
  }
  return { low, high };
}

const DAY = 86400000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
/** 以星期一為一週的開始（1970-01-01 是星期四） */
const weekNum = (iso: string) => Math.floor((dayNum(iso) + 3) / 7);

/** 每根 K 棒屬於哪一期；同一期的第一根 K 棒就是操作日 */
function periodKey(iso: string, cadence: Cadence, startWeek: number): string | number {
  switch (cadence) {
    case 'daily':
      return iso;
    case 'weekly':
      return weekNum(iso);
    case 'biweekly':
      return Math.floor((weekNum(iso) - startWeek) / 2);
    case 'monthly':
      return iso.slice(0, 7);
  }
}

/** 區間裡的操作日（每一期的第一根 K 棒；第一根 K 棒一定是操作日） */
export function dcaDays(candles: readonly Candle[], start: number, end: number, cadence: Cadence): number[] {
  const out: number[] = [];
  if (start < 0 || end < start) return out;
  const startWeek = weekNum(candles[start]!.time);
  let prev: string | number | null = null;
  for (let i = start; i <= end; i++) {
    const key = periodKey(candles[i]!.time, cadence, startWeek);
    if (key !== prev) out.push(i);
    prev = key;
  }
  return out;
}

export interface DcaEvent {
  index: number;
  kind: 'buy' | 'sell';
  price: number;
  /** 買進：付出的錢（含手續費）；賣出：拿回的錢（已扣手續費和稅） */
  cash: number;
  units: number;
  /** 交易後還持有多少 */
  holdings: number;
  /** 依照哪一階（-1 = 基準區間） */
  ruleIndex: number;
}

export interface DcaResult {
  start: number;
  end: number;
  events: DcaEvent[];
  /** 操作日的天數（看了幾次價格） */
  periods: number;
  buys: number;
  sells: number;
  maxBuy: number;
  /** 總共投入（買進付出的錢） */
  invested: number;
  /** 賣出拿回的錢 */
  cashOut: number;
  unitsBought: number;
  unitsSold: number;
  /** 期末還持有的數量 */
  units: number;
  finalPrice: number;
  /** 期末持有的價值 */
  holdingValue: number;
  /** 期末持有的價值＋拿回的錢 */
  totalValue: number;
  profit: number;
  returnPct: number | null;
  /** 平均買進成本（含手續費） */
  avgCost: number | null;
  /** 把投入的時間和金額算進去的年化報酬（XIRR）；期間不到一年時是 null */
  xirr: number | null;
  /** 期間中帳面最差的時候（總價值 ÷ 累計投入 − 1） */
  worst: { pct: number; index: number } | null;
  /** 每根 K 棒的累計投入、總價值（畫圖用，對應 start..end） */
  investedSeries: number[];
  valueSeries: number[];
  /** 每一階出現幾次（-1 = 基準區間） */
  zoneCounts: Map<number, number>;
}

/**
 * XIRR：讓所有現金流（投入是負的、拿回和期末價值是正的）折現後加總為 0 的年化報酬率。
 * 投入時間、金額都不一樣時，比較報酬要用它。找不到時回傳 null。
 */
export function xirr(flows: { day: number; v: number }[]): number | null {
  if (!flows.some((f) => f.v < 0) || !flows.some((f) => f.v > 0)) return null;
  const d0 = Math.min(...flows.map((f) => f.day));
  const npv = (r: number) => flows.reduce((s, f) => s + f.v / Math.pow(1 + r, (f.day - d0) / 365), 0);
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return null;
  if (flo * fhi > 0) {
    hi = 1000;
    fhi = npv(hi);
    if (flo * fhi > 0) return null;
  }
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-10) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** 依照價格階梯操作（rules 是空的就是一般定投：每期固定金額、不賣） */
export function runDca(candles: readonly Candle[], start: number, end: number, plan: DcaPlan, costs: DcaCosts): DcaResult {
  const days = new Set(dcaDays(candles, start, end, plan.cadence));
  const events: DcaEvent[] = [];
  const zoneCounts = new Map<number, number>();
  const investedSeries: number[] = [];
  const valueSeries: number[] = [];
  const flows: { day: number; v: number }[] = [];
  const fired = new Set<number>();
  let holdings = 0;
  let invested = 0;
  let cashOut = 0;
  let unitsBought = 0;
  let unitsSold = 0;
  let buys = 0;
  let sells = 0;
  let maxBuy = 0;
  let worst: DcaResult['worst'] = null;

  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    if (days.has(i)) {
      const price = c.close;
      const zone = zoneAt(plan, price);
      zoneCounts.set(zone.ruleIndex, (zoneCounts.get(zone.ruleIndex) ?? 0) + 1);
      // 跌回基準價格以下：「每個價位只賣一次」重新啟動
      if (price < plan.basePrice) fired.clear();
      const a = zone.action;
      if (a.kind === 'buy' && a.amount > 0) {
        const units = (a.amount * (1 - costs.feeRate)) / price;
        holdings += units;
        invested += a.amount;
        unitsBought += units;
        buys++;
        maxBuy = Math.max(maxBuy, a.amount);
        flows.push({ day: dayNum(c.time), v: -a.amount });
        events.push({ index: i, kind: 'buy', price, cash: a.amount, units, holdings, ruleIndex: zone.ruleIndex });
      } else if (a.kind === 'sell' && holdings > 0) {
        const toSell =
          plan.sellMode === 'every'
            ? [zone.ruleIndex]
            : plan.rules
                .map((r, j) => ({ r, j }))
                .filter(({ r, j }) => r.action.kind === 'sell' && isAbove(plan, r) && price >= r.price && !fired.has(j))
                .sort((x, y) => x.r.price - y.r.price)
                .map(({ j }) => j);
        for (const j of toSell) {
          const act = plan.rules[j]!.action;
          if (act.kind !== 'sell') continue;
          const units = holdings * Math.min(1, Math.max(0, act.pct / 100));
          if (units <= 0) continue;
          const proceeds = units * price * (1 - costs.feeRate - costs.sellTaxRate);
          holdings -= units;
          cashOut += proceeds;
          unitsSold += units;
          sells++;
          flows.push({ day: dayNum(c.time), v: proceeds });
          events.push({ index: i, kind: 'sell', price, cash: proceeds, units, holdings, ruleIndex: j });
          if (plan.sellMode === 'once') fired.add(j);
        }
      }
    }
    const value = holdings * c.close + cashOut;
    investedSeries.push(invested);
    valueSeries.push(value);
    if (invested > 0) {
      const pct = value / invested - 1;
      if (!worst || pct < worst.pct) worst = { pct, index: i };
    }
  }

  const finalPrice = candles[end]!.close;
  const holdingValue = holdings * finalPrice;
  const totalValue = holdingValue + cashOut;
  const spanDays = dayNum(candles[end]!.time) - dayNum(candles[start]!.time);
  if (holdingValue > 0) flows.push({ day: dayNum(candles[end]!.time), v: holdingValue });
  return {
    start,
    end,
    events,
    periods: days.size,
    buys,
    sells,
    maxBuy,
    invested,
    cashOut,
    unitsBought,
    unitsSold,
    units: holdings,
    finalPrice,
    holdingValue,
    totalValue,
    profit: totalValue - invested,
    returnPct: invested > 0 ? totalValue / invested - 1 : null,
    avgCost: unitsBought > 0 ? invested / unitsBought : null,
    xirr: spanDays >= 365 ? xirr(flows) : null,
    worst,
    investedSeries,
    valueSeries,
    zoneCounts,
  };
}

/** 一般定投：每期固定金額、不賣（對照用） */
export function plainPlan(plan: DcaPlan): DcaPlan {
  return { ...plan, rules: [] };
}

/** 三位有效數字（產生預設的價格階梯用） */
export function nice(v: number): number {
  if (!(v > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 2);
  return Math.round(v / p) * p;
}

/**
 * 預設的價格階梯。比特幣用使用者提出的例子：基準 8 萬、每週 100 美元，
 * 跌到 7 萬買 120、6 萬買 150；漲到 9 萬買 50、10 萬買 30；11 萬開始賣 10%、12 萬賣 20%。
 * 其他標的以目前價格為基準，每 5% 一階（股票的波動大約是比特幣的三分之一）。
 */
export function defaultPlan(assetId: string, price: number): DcaPlan {
  if (assetId === 'BTC') {
    return {
      basePrice: 80000,
      baseAmount: 100,
      cadence: 'weekly',
      sellMode: 'every',
      rules: [
        { price: 120000, action: { kind: 'sell', pct: 20 } },
        { price: 110000, action: { kind: 'sell', pct: 10 } },
        { price: 100000, action: { kind: 'buy', amount: 30 } },
        { price: 90000, action: { kind: 'buy', amount: 50 } },
        { price: 70000, action: { kind: 'buy', amount: 120 } },
        { price: 60000, action: { kind: 'buy', amount: 150 } },
      ],
    };
  }
  const base = nice(price);
  const amount = assetId === '0050' ? 3000 : 100;
  const at = (pct: number) => nice(base * (1 + pct));
  return {
    basePrice: base,
    baseAmount: amount,
    cadence: 'weekly',
    sellMode: 'every',
    rules: [
      { price: at(0.2), action: { kind: 'sell', pct: 20 } },
      { price: at(0.15), action: { kind: 'sell', pct: 10 } },
      { price: at(0.1), action: { kind: 'buy', amount: amount * 0.3 } },
      { price: at(0.05), action: { kind: 'buy', amount: amount * 0.5 } },
      { price: at(-0.05), action: { kind: 'buy', amount: amount * 1.2 } },
      { price: at(-0.1), action: { kind: 'buy', amount: amount * 1.5 } },
    ],
  };
}

export const MAX_RULES = 12;

const finitePos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** 檢查存起來的設定；格式不對就回傳 null（改用預設） */
export function sanitizePlan(raw: unknown): DcaPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<DcaPlan>;
  if (!finitePos(p.basePrice) || typeof p.baseAmount !== 'number' || !Number.isFinite(p.baseAmount) || p.baseAmount < 0) return null;
  const cadence = CADENCES.includes(p.cadence as Cadence) ? (p.cadence as Cadence) : 'weekly';
  const sellMode: SellMode = p.sellMode === 'once' ? 'once' : 'every';
  const rules: LadderRule[] = [];
  for (const r of Array.isArray(p.rules) ? p.rules : []) {
    if (!r || typeof r !== 'object' || !finitePos(r.price) || r.price === p.basePrice) continue;
    const a = r.action as DcaAction | undefined;
    if (a?.kind === 'buy' && typeof a.amount === 'number' && Number.isFinite(a.amount) && a.amount >= 0) {
      rules.push({ price: r.price, action: { kind: 'buy', amount: a.amount } });
    } else if (a?.kind === 'sell' && finitePos(a.pct) && a.pct <= 100) {
      rules.push({ price: r.price, action: { kind: 'sell', pct: a.pct } });
    } else if (a?.kind === 'hold') {
      rules.push({ price: r.price, action: { kind: 'hold' } });
    }
    if (rules.length >= MAX_RULES) break;
  }
  const setOn = typeof p.setOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.setOn) ? p.setOn : undefined;
  return { basePrice: p.basePrice, baseAmount: p.baseAmount, cadence, sellMode, rules, ...(setOn ? { setOn } : {}) };
}
