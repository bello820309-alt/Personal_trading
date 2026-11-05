import type { AssetConfig } from '../config/assets';
import type { Candle } from '../data/types';
import { daysBetween, fmtDate, fmtNum, fmtPct } from '../data/format';
import { MIN_TRADES, sortRows, splitBySample, type AdjacentCheck, type RankResult, type RankRow, type YearChampion } from './rank';

/*
 * 策略排行榜的「白話結論」：完全依照回測數字、用固定規則寫成句子（不是預測，也不是投資建議）。
 */

const pp = (a: number, b: number) => fmtNum(Math.abs(a - b) * 100, 1);

export const strategyName = (r: RankRow) => `「${r.def.name}」`;

/** 和買進持有比：多賺／少賺幾個百分點 */
function versusHold(r: RankRow, hold: number): string {
  const diff = r.totalReturn - hold;
  if (Math.abs(diff) < 0.01) return '和一直抱著差不多';
  return `比一直抱著${diff > 0 ? '多賺' : '少賺'} ${pp(r.totalReturn, hold)} 個百分點`;
}

/** 這段期間的走勢：大漲、大跌、盤整… */
export function marketMood(holdReturn: number, years: number): string {
  const perYear = years > 0 ? holdReturn / Math.max(years, 0.25) : holdReturn;
  if (holdReturn >= 0.5 || (holdReturn > 0 && perYear >= 0.4)) return '大漲';
  if (holdReturn <= -0.3) return '大跌';
  if (Math.abs(holdReturn) <= 0.1) return '盤整';
  return holdReturn > 0 ? '上漲' : '下跌';
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function summarizeRanking(result: RankResult, candles: Candle[], asset: AssetConfig): string[] {
  const out: string[] = [];
  const from = candles[result.start]!.time;
  const to = candles[result.end]!.time;
  const days = daysBetween(from, to);
  const hold = result.benchmark.totalReturn;
  const mood = marketMood(hold, result.benchmark.years);
  out.push(
    `${fmtDate(from)}～${fmtDate(to)}（${days >= 365 ? `約 ${fmtNum(days / 365.25, 1)} 年` : `${days} 天`}），` +
      `${asset.name}「買了一直抱著」的報酬是 ${fmtPct(hold)}，是一段${mood}的行情。`,
  );

  const { ranked, lowSample } = splitBySample(result.rows);
  if (ranked.length === 0) {
    out.push(`這段期間沒有任何策略完成 ${MIN_TRADES} 筆以上的交易，勝率排名沒有參考價值。可以把期間拉長到 1 年以上再看看。`);
    return out;
  }

  const top = sortRows(ranked, 'winRate')[0]!;
  out.push(
    `勝率最高的是${strategyName(top)}：${top.trades} 筆交易中有 ${top.wins} 筆賺錢（勝率 ${fmtPct(top.winRate, 0, false)}），` +
      `總報酬 ${fmtPct(top.totalReturn)}，${versusHold(top, hold)}。`,
  );
  const best = sortRows(ranked, 'return')[0]!;
  if (best.def.id === top.def.id) {
    out.push('它同時也是總報酬最高的策略。');
  } else {
    out.push(
      `總報酬最高的則是${strategyName(best)} ${fmtPct(best.totalReturn)}，勝率是 ${fmtPct(best.winRate, 0, false)}。` +
        (best.winRate !== null && top.winRate !== null && best.winRate < top.winRate ? '可見勝率最高的，不一定最賺錢。' : ''),
    );
  }

  const all = result.rows;
  const beaters = all.filter((r) => r.totalReturn > hold).sort((a, b) => b.totalReturn - a.totalReturn);
  const beat = beaters.length;
  // 贏的不多時直接說是哪幾個，新手才知道要去看哪一個
  const names = beat > 0 && beat <= 3 ? `：${beaters.map((r) => `${strategyName(r)}（${fmtPct(r.totalReturn)}）`).join('、')}` : '';
  out.push(
    beat === 0
      ? `${all.length} 個策略裡，沒有任何一個的總報酬贏過「買了一直抱著」。`
      : `${all.length} 個策略裡，有 ${beat} 個的總報酬贏過「買了一直抱著」${names}。`,
  );

  const trend = all.filter((r) => r.def.category === 'trend').map((r) => r.totalReturn);
  const osc = all.filter((r) => r.def.category === 'momentum').map((r) => r.totalReturn);
  if (trend.length >= 3 && osc.length >= 3) {
    const t = average(trend);
    const o = average(osc);
    let why = '';
    if (Math.abs(t - o) >= 0.05) {
      if (t > o && hold > 0.2) why = '：上漲行情裡，順勢的趨勢類比較抱得住，擺盪類常常太早賣出。';
      else if (t > o && hold < -0.2) why = '：下跌行情裡，趨勢類通常比較早出場；擺盪類常在「看起來跌夠了」時買進，結果繼續跌。';
      else if (o > t) why = '：價格來回震盪時，擺盪類「跌深買、漲多賣」比較吃香，趨勢類容易被來回洗出場。';
    }
    out.push(`趨勢類策略平均總報酬 ${fmtPct(t)}，動能／擺盪類平均 ${fmtPct(o)}${why || '。'}`);
  }

  if (lowSample.length) {
    out.push(`另外有 ${lowSample.length} 個策略交易不到 ${MIN_TRADES} 次，運氣成分太大，沒有列入排名（放在排行榜下面）。`);
  }
  return out;
}

export function summarizeAdjacent(check: AdjacentCheck, candles: Candle[]): string[] {
  const c = check.champion;
  const o = check.otherRow;
  const span = (r: RankResult) => `${fmtDate(candles[r.start]!.time)}～${fmtDate(candles[r.end]!.time)}`;
  const out: string[] = [];
  out.push(
    check.direction === 'next'
      ? `這段期間的勝率冠軍是${strategyName(c)}（勝率 ${fmtPct(c.winRate, 0, false)}）。接下來同樣長度的期間（${span(check.other)}）：`
      : `這段期間之後還沒有資料，所以反過來看：上一段期間（${span(check.base)}）的勝率冠軍是${strategyName(c)}（勝率 ${fmtPct(c.winRate, 0, false)}），到了這段期間：`,
  );
  if (check.otherRank === null) {
    out.push(`它只完成 ${o.trades} 筆交易，不到 ${MIN_TRADES} 筆，連排名的資格都沒有。`);
  } else {
    out.push(
      `勝率變成 ${fmtPct(o.winRate, 0, false)}，在 ${check.otherRankedCount} 個策略裡排第 ${check.otherRank} 名；` +
        `總報酬 ${fmtPct(o.totalReturn)}（同期間一直抱著 ${fmtPct(check.other.benchmark.totalReturn)}）。`,
    );
  }
  const kept = check.otherRank !== null && check.otherRank <= 3;
  out.push(
    kept
      ? '這次冠軍還維持在前段班，但一兩次的結果不能保證以後也會這樣。'
      : '「過去最好」不等於「接下來也最好」：市場的節奏一變，適合的策略也跟著變。',
  );
  return out;
}

export function summarizeYearly(list: YearChampion[]): string[] {
  if (list.length === 0) return ['資料的年數不夠，還沒辦法比較。'];
  const ranked = list.filter((y) => y.nextRank !== null);
  const top3 = ranked.filter((y) => y.nextRank! <= 3).length;
  const dropped = list.length - ranked.length;
  const out: string[] = [];
  if (ranked.length) {
    const avgRank = average(ranked.map((y) => y.nextRank!));
    const avgCount = average(ranked.map((y) => y.nextRankedCount));
    out.push(
      `過去 ${list.length} 個「當年勝率冠軍」，到了隔年平均排第 ${fmtNum(avgRank, 1)} 名（每年大約 ${fmtNum(avgCount, 0)} 個策略有排名），` +
        `只有 ${top3} 次還在前三名。`,
    );
  }
  if (dropped) out.push(`有 ${dropped} 次，冠軍到了隔年交易不到 ${MIN_TRADES} 次，連排名資格都沒有。`);
  out.push('如果每年都換成「去年的冠軍」，等於一直在追逐過去的表現，這是新手最常踩的坑之一。');
  return out;
}
