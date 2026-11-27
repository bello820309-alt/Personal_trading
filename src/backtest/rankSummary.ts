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

/**
 * 排行榜最重要的一句：幾個策略的總報酬贏過「買了一直抱著」。放在白話結論最上面、放大顯示。
 * 交易次數不夠的也算進分母（一樣是這段期間可以選的策略）。
 */
export function beatHoldHeadline(result: RankResult): string {
  const hold = result.benchmark.totalReturn;
  const all = result.rows;
  const beaters = all.filter((r) => r.totalReturn > hold).sort((a, b) => b.totalReturn - a.totalReturn);
  const names = beaters.length > 0 && beaters.length <= 3 ? `：${beaters.map((r) => `${strategyName(r)}（${fmtPct(r.totalReturn)}）`).join('、')}` : '';
  // 交易太少的也算在裡面（下跌的期間，一筆都沒買就是拿著現金，也會贏）：說清楚有幾個沒列入排名
  const low = beaters.filter((r) => r.trades < MIN_TRADES);
  const none = low.filter((r) => r.trades === 0).length;
  const lowNote = low.length
    ? `其中 ${low.length} 個交易不到 ${MIN_TRADES} 筆${none ? `（${none} 個一筆都沒買，等於一直拿著現金）` : ''}，沒有列入下面的排名。`
    : '';
  return `${all.length} 個策略裡有 ${beaters.length} 個的總報酬贏過「買了一直抱著」（${fmtPct(hold)}）${names}。${lowNote}`;
}

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
    out.push(`這段期間沒有任何策略完成 ${MIN_TRADES} 筆以上的交易，排名沒有參考價值。可以把期間拉長到 1 年以上再看看。`);
    return out;
  }

  const best = sortRows(ranked, 'return')[0]!;
  // 交易不到 MIN_TRADES 筆、總報酬卻更高的：寫出來，免得以為結論漏看了
  const higherLow = sortRows(lowSample, 'return').filter((r) => r.trades > 0 && r.totalReturn > best.totalReturn);
  out.push(
    `列入排名（交易 ${MIN_TRADES} 筆以上）的策略裡，總報酬最高的是${strategyName(best)}：${fmtPct(best.totalReturn)}，${versusHold(best, hold)}（勝率 ${fmtPct(best.winRate, 0, false)}，${best.trades} 筆交易）。` +
      (higherLow.length
        ? `交易不到 ${MIN_TRADES} 筆的${higherLow
            .slice(0, 3)
            .map((r) => `${strategyName(r)}（${fmtPct(r.totalReturn)}，${r.trades} 筆）`)
            .join('、')}總報酬更高，但次數太少，看不出是規則好還是剛好碰上，所以沒有列入排名。`
        : ''),
  );
  const top = sortRows(ranked, 'winRate')[0]!;
  if (top.def.id === best.def.id) {
    out.push('它同時也是勝率最高的策略。');
  } else {
    out.push(
      `勝率最高的則是${strategyName(top)}：${top.trades} 筆交易中有 ${top.wins} 筆賺錢（勝率 ${fmtPct(top.winRate, 0, false)}），` +
        `但總報酬只有 ${fmtPct(top.totalReturn)}。勝率是「賺錢的交易占幾 %」，不管每次賺賠多少，所以勝率最高的不一定最賺錢。`,
    );
  }

  const all = result.rows;
  const trend = all.filter((r) => r.def.category === 'trend').map((r) => r.totalReturn);
  const osc = all.filter((r) => r.def.category === 'momentum').map((r) => r.totalReturn);
  if (trend.length >= 3 && osc.length >= 3) {
    const t = average(trend);
    const o = average(osc);
    // 只寫算出來的數字：哪一類比較好和這段期間的走勢有關，原因這裡沒有另外驗證，不編故事
    const gap = Math.abs(t - o) >= 0.05 ? `這段期間${t > o ? '趨勢類' : '動能／擺盪類'}比較好；` : '兩類差不多；';
    out.push(`趨勢類策略平均總報酬 ${fmtPct(t)}，動能／擺盪類平均 ${fmtPct(o)}。${gap}哪一類比較好和這段期間怎麼走有關，換一段期間可能就反過來，可以改上面的期間試試看。`);
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
