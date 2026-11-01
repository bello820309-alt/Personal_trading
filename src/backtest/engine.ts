import type { Candle } from '../data/types';
import type { Signal } from '../indicators/types';
import { equityMetrics, type EquityMetrics, type EquityPoint } from './metrics';

/*
 * 簡單、透明的回測引擎（新手版）：
 * - 只做多，每次都是全部資金進出。
 * - 訊號在第 t 根 K 棒「收盤」時才確定，所以在第 t+1 根的「開盤價」成交（不偷看未來）。
 * - 買賣都扣手續費（有最低收費），賣出另扣交易稅。
 * - 期末仍持有的部位以最後收盤價計算市值（不扣賣出成本），買進持有也一樣。
 * - 允許買零股（小數股數），讓不同價位的標的可以公平比較。
 */

export interface BacktestConfig {
  initialCapital: number;
  /** 每次買或賣的手續費率 */
  feeRate: number;
  /** 手續費折扣（1 = 不打折） */
  feeDiscount: number;
  /** 每筆最低手續費 */
  minFee: number;
  /** 賣出交易稅率 */
  sellTaxRate: number;
}

export interface Trade {
  entryIndex: number;
  entryTime: string;
  entryPrice: number;
  entryLabel: string;
  shares: number;
  /** 買進總成本（含手續費） */
  cost: number;
  exitIndex: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  exitLabel: string | null;
  /** 賣出後拿回的現金（扣費用與稅）；未平倉時是目前市值 */
  proceeds: number;
  returnPct: number;
  holdingDays: number;
  open: boolean;
  fees: number;
}

export interface TradeStats {
  closedCount: number;
  winRate: number | null;
  avgReturn: number | null;
  bestReturn: number | null;
  worstReturn: number | null;
  avgHoldingDays: number | null;
  /** 有持股的 K 棒比例 */
  exposure: number;
  totalFees: number;
}

export interface BacktestResult {
  startIndex: number;
  endIndex: number;
  trades: Trade[];
  equity: EquityPoint[];
  benchmark: EquityPoint[];
  metrics: EquityMetrics;
  benchmarkMetrics: EquityMetrics;
  stats: TradeStats;
  benchmarkFees: number;
}

function days(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** 用全部現金買進，回傳股數與手續費（考慮最低手續費） */
export function buyAll(cash: number, price: number, cfg: BacktestConfig): { shares: number; fee: number } {
  const f = cfg.feeRate * cfg.feeDiscount;
  if (cash <= 0 || price <= 0) return { shares: 0, fee: 0 };
  let notional = cash / (1 + f);
  let fee = notional * f;
  if (cfg.minFee > 0 && fee < cfg.minFee) {
    fee = cfg.minFee;
    notional = cash - fee;
  }
  if (notional <= 0) return { shares: 0, fee: 0 };
  return { shares: notional / price, fee };
}

/** 全部賣出，回傳拿回的現金與費用 */
export function sellAll(shares: number, price: number, cfg: BacktestConfig): { cash: number; fee: number; tax: number } {
  const gross = shares * price;
  const f = cfg.feeRate * cfg.feeDiscount;
  let fee = gross * f;
  if (cfg.minFee > 0 && fee < cfg.minFee) fee = Math.min(cfg.minFee, gross);
  const tax = gross * cfg.sellTaxRate;
  return { cash: gross - fee - tax, fee, tax };
}

export function runBacktest(
  candles: Candle[],
  signals: Signal[],
  startIndex: number,
  endIndex: number,
  cfg: BacktestConfig,
  ppy: number,
): BacktestResult {
  const start = Math.max(0, startIndex);
  const end = Math.min(candles.length - 1, endIndex);
  const byIndex = new Map<number, Signal>();
  for (const s of signals) if (s.index >= start && s.index < end) byIndex.set(s.index, s);

  let cash = cfg.initialCapital;
  let shares = 0;
  let current: Trade | null = null;
  let pending: Signal | null = null;
  let barsInMarket = 0;
  let totalFees = 0;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    // 1) 開盤時執行昨天收盤確定的訊號
    if (pending) {
      if (pending.side === 'buy' && shares === 0) {
        const { shares: q, fee } = buyAll(cash, c.open, cfg);
        if (q > 0) {
          shares = q;
          totalFees += fee;
          current = {
            entryIndex: i,
            entryTime: c.time,
            entryPrice: c.open,
            entryLabel: pending.label,
            shares: q,
            cost: cash,
            exitIndex: null,
            exitTime: null,
            exitPrice: null,
            exitLabel: null,
            proceeds: cash,
            returnPct: 0,
            holdingDays: 0,
            open: true,
            fees: fee,
          };
          cash = 0;
        }
      } else if (pending.side === 'sell' && shares > 0 && current) {
        const r = sellAll(shares, c.open, cfg);
        totalFees += r.fee + r.tax;
        current.exitIndex = i;
        current.exitTime = c.time;
        current.exitPrice = c.open;
        current.exitLabel = pending.label;
        current.proceeds = r.cash;
        current.returnPct = r.cash / current.cost - 1;
        current.holdingDays = days(current.entryTime, c.time);
        current.open = false;
        current.fees += r.fee + r.tax;
        trades.push(current);
        current = null;
        cash = r.cash;
        shares = 0;
      }
      pending = null;
    }
    // 2) 收盤時計算資產
    if (shares > 0) barsInMarket++;
    equity.push({ time: c.time, value: cash + shares * c.close });
    // 3) 收盤後檢查今天有沒有新訊號（明天開盤執行）
    const sig = byIndex.get(i);
    if (sig && ((sig.side === 'buy' && shares === 0) || (sig.side === 'sell' && shares > 0))) pending = sig;
  }

  if (current) {
    const last = candles[end]!;
    current.proceeds = shares * last.close;
    current.returnPct = current.proceeds / current.cost - 1;
    current.holdingDays = days(current.entryTime, last.time);
    trades.push(current);
  }

  // 買進持有：第一天開盤買進，一直抱到最後
  const benchmark: EquityPoint[] = [];
  const first = candles[start]!;
  const bh = buyAll(cfg.initialCapital, first.open, cfg);
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    benchmark.push({ time: c.time, value: bh.shares * c.close });
  }

  const closed = trades.filter((t) => !t.open);
  const rets = closed.map((t) => t.returnPct);
  const stats: TradeStats = {
    closedCount: closed.length,
    winRate: closed.length ? closed.filter((t) => t.returnPct > 0).length / closed.length : null,
    avgReturn: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
    bestReturn: rets.length ? Math.max(...rets) : null,
    worstReturn: rets.length ? Math.min(...rets) : null,
    avgHoldingDays: closed.length ? closed.reduce((a, t) => a + t.holdingDays, 0) / closed.length : null,
    exposure: equity.length ? barsInMarket / equity.length : 0,
    totalFees,
  };

  return {
    startIndex: start,
    endIndex: end,
    trades,
    equity,
    benchmark,
    metrics: equityMetrics(equity, ppy),
    benchmarkMetrics: equityMetrics(benchmark, ppy),
    stats,
    benchmarkFees: bh.fee,
  };
}
