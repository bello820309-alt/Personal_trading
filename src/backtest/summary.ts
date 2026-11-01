import type { AssetConfig } from '../config/assets';
import { fmtDate, fmtMoney, fmtNum, fmtPct } from '../data/format';
import type { BacktestResult } from './engine';

/** 把回測結果翻成幾句白話 */
export function summarizeBacktest(res: BacktestResult, asset: AssetConfig, strategyName: string): string[] {
  const m = res.metrics;
  const b = res.benchmarkMetrics;
  const s = res.stats;
  const startTime = res.equity[0]?.time;
  const endTime = res.equity[res.equity.length - 1]?.time;
  const out: string[] = [];
  out.push(
    `從 ${fmtDate(startTime)} 到 ${fmtDate(endTime)}（約 ${fmtNum(m.years, 1)} 年），用「${strategyName}」操作 ${asset.name}：` +
      `總報酬 ${fmtPct(m.totalReturn)}${m.cagr !== null ? `（年化 ${fmtPct(m.cagr)}）` : ''}；` +
      `同期間一直抱著（買進持有）：${fmtPct(b.totalReturn)}${b.cagr !== null ? `（年化 ${fmtPct(b.cagr)}）` : ''}。`,
  );
  const diff = (m.totalReturn - b.totalReturn) * 100;
  if (Math.abs(diff) < 1) out.push('兩者的總報酬差不多。');
  else out.push(`策略比買進持有${diff > 0 ? '多賺' : '少賺'}了 ${fmtNum(Math.abs(diff), 1)} 個百分點。`);
  const ddDiff = (b.maxDrawdown - m.maxDrawdown) * 100;
  out.push(
    `最大回撤：策略 −${fmtNum(m.maxDrawdown * 100, 1)}%、買進持有 −${fmtNum(b.maxDrawdown * 100, 1)}%` +
      (Math.abs(ddDiff) < 1 ? '，過程中的最大跌幅差不多。' : ddDiff > 0 ? '，策略過程中跌得比較少。' : '，策略過程中反而跌得比較多。'),
  );
  if (s.closedCount > 0) {
    out.push(
      `共完成 ${s.closedCount} 筆交易，勝率 ${fmtPct(s.winRate, 0, false)}，平均每筆 ${fmtPct(s.avgReturn)}，平均持有 ${fmtNum(
        s.avgHoldingDays,
        0,
      )} 天；大約 ${fmtPct(s.exposure, 0, false)} 的時間有持股。`,
    );
  } else {
    out.push('這段期間沒有完成任何一筆交易。');
  }
  const open = res.trades.find((t) => t.open);
  if (open) out.push(`期末仍持有中（${fmtDate(open.entryTime)} 買進，目前報酬 ${fmtPct(open.returnPct)}）。`);
  if (s.totalFees > 0) out.push(`總共付出手續費與稅 ${fmtMoney(s.totalFees, asset)}。`);
  if (s.closedCount < 5) out.push('交易次數很少，結果受運氣影響很大，參考就好。');
  return out;
}
