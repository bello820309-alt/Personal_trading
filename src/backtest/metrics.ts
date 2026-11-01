export interface EquityPoint {
  time: string;
  value: number;
}

export interface EquityMetrics {
  startValue: number;
  finalValue: number;
  /** 總報酬（0.25 = +25%） */
  totalReturn: number;
  /** 年化報酬（期間太短時為 null） */
  cagr: number | null;
  years: number;
  /** 最大回撤（0.3 = 最多跌掉 30%） */
  maxDrawdown: number;
  maxDrawdownPeak: string | null;
  maxDrawdownTrough: string | null;
  /** 年化波動率 */
  volatility: number | null;
  /** 夏普值（未扣無風險利率） */
  sharpe: number | null;
}

export function yearsBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (365.25 * 86400000);
}

/** 用資料本身估計一年大約有幾根 K 棒（台股約 245、美股約 252、加密貨幣 365） */
export function periodsPerYear(times: string[]): number {
  if (times.length < 2) return 252;
  const y = yearsBetween(times[0]!, times[times.length - 1]!);
  return y > 0 ? (times.length - 1) / y : 252;
}

export function equityMetrics(equity: EquityPoint[], ppy: number): EquityMetrics {
  const n = equity.length;
  if (n === 0) {
    return {
      startValue: 0,
      finalValue: 0,
      totalReturn: 0,
      cagr: null,
      years: 0,
      maxDrawdown: 0,
      maxDrawdownPeak: null,
      maxDrawdownTrough: null,
      volatility: null,
      sharpe: null,
    };
  }
  const start = equity[0]!.value;
  const final = equity[n - 1]!.value;
  const years = yearsBetween(equity[0]!.time, equity[n - 1]!.time);
  const totalReturn = start > 0 ? final / start - 1 : 0;
  const cagr = years >= 0.5 && start > 0 && final > 0 ? (final / start) ** (1 / years) - 1 : null;

  let peak = equity[0]!;
  let mdd = 0;
  let mddPeak: string | null = null;
  let mddTrough: string | null = null;
  for (const p of equity) {
    if (p.value > peak.value) peak = p;
    const dd = peak.value > 0 ? 1 - p.value / peak.value : 0;
    if (dd > mdd) {
      mdd = dd;
      mddPeak = peak.time;
      mddTrough = p.time;
    }
  }

  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    const a = equity[i - 1]!.value;
    if (a > 0) rets.push(equity[i]!.value / a - 1);
  }
  let volatility: number | null = null;
  let sharpe: number | null = null;
  if (rets.length >= 20) {
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
    const sd = Math.sqrt(variance);
    volatility = sd * Math.sqrt(ppy);
    sharpe = sd > 0 ? (mean / sd) * Math.sqrt(ppy) : null;
  }
  return {
    startValue: start,
    finalValue: final,
    totalReturn,
    cagr,
    years,
    maxDrawdown: mdd,
    maxDrawdownPeak: mddPeak,
    maxDrawdownTrough: mddTrough,
    volatility,
    sharpe,
  };
}
