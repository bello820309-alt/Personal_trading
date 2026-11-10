import type { AssetConfig } from '../config/assets';
import type { Candle } from '../data/types';
import { fmtDate, fmtNum, fmtPct } from '../data/format';
import { calendarFor, type CheckResult, type Forecast } from './analog';

/* 走勢預測的白話說明：全部依照計算出來的數字，用固定規則寫成句子 */

const pp = (x: number) => fmtNum(Math.abs(x) * 100, 1);

function rsiWord(r: number): string {
  if (r >= 70) return '超買';
  if (r >= 50) return '偏強';
  if (r >= 30) return '偏弱';
  return '超賣';
}

function volWord(v: number): string {
  if (v >= 1.3) return '比過去一年激烈';
  if (v <= 0.8) return '比過去一年平靜';
  return '和過去一年差不多';
}

/** 每天漲跌幅（對數報酬）的標準差：第 to 根往前 n 個報酬；資料不夠時是 null */
function dailySd(candles: readonly Candle[], to: number, n: number): number | null {
  if (to - n < 0) return null;
  const r: number[] = [];
  for (let i = to - n + 1; i <= to; i++) r.push(Math.log(candles[i]!.close / candles[i - 1]!.close));
  const m = r.reduce((a, x) => a + x, 0) / r.length;
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / r.length);
}

/** 「現在」的狀態：最近的漲跌、趨勢位置、RSI、波動、離高點多遠 */
export function describeNow(f: Forecast, candles: Candle[], asset: AssetConfig): string {
  const [r1w, , r1m, , r3m, ma, rsi, vol, dd] = f.features as [number, number, number, number, number, number, number, number, number];
  const cal = calendarFor(asset);
  const sdMonth = dailySd(candles, f.target, cal.month);
  const sdYear = dailySd(candles, f.target, cal.year);
  const volNote =
    sdMonth !== null && sdYear !== null
      ? `（這裡的「波動」是每天漲跌幅的標準差，大約是一天通常會漲跌幾 %：最近 1 個月約 ±${fmtNum(sdMonth * 100, 2)}%，過去一年約 ±${fmtNum(sdYear * 100, 2)}%。）`
      : '（這裡的「波動」是每天漲跌幅的標準差，大約是一天通常會漲跌幾 %。）';
  // 最近 1 個月：幾天漲、幾天跌，以及最大的一天漲跌（全部照資料寫，不憑印象）
  const moves: number[] = [];
  for (let i = Math.max(1, f.target - cal.month + 1); i <= f.target; i++) moves.push(candles[i]!.close / candles[i - 1]!.close - 1);
  const ups = moves.filter((x) => x > 0).length;
  const downs = moves.filter((x) => x < 0).length;
  const best = moves.length ? Math.max(...moves) : 0;
  const worst = moves.length ? Math.min(...moves) : 0;
  // 平均一天漲多少、跌多少
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
  const avgUp = avgOf(moves.filter((x) => x > 0));
  const avgDown = Math.abs(avgOf(moves.filter((x) => x < 0)));
  const falling = r1m < 0;
  const sameDays = falling ? downs : ups;
  const otherDays = falling ? ups : downs;
  const sameAvg = falling ? avgDown : avgUp;
  const otherAvg = falling ? avgUp : avgDown;
  const verb = falling ? '跌' : '漲';
  const otherVerb = falling ? '漲' : '跌';
  const reasons: string[] = [];
  if (sameDays >= otherDays * 1.5 && sameDays - otherDays >= 3) reasons.push(`${verb}的日子比較多`);
  if (otherAvg > 0 && sameAvg >= otherAvg * 1.2) reasons.push(`${verb}的日子平均${verb}得比較多（平均${verb} ${pp(sameAvg)}%，${otherVerb}的日子平均只${otherVerb} ${pp(otherAvg)}%）`);
  const why = reasons.length
    ? `主要是${reasons.join('，而且')}`
    : `${verb}的天數和平均幅度都沒有差很多（${verb}的日子平均${verb} ${pp(sameAvg)}%，${otherVerb}的日子平均${otherVerb} ${pp(otherAvg)}%），是幾天比較大的${verb}幅加起來造成的`;
  const bigMove =
    Math.abs(r1m) >= 0.08 && vol < 1.3 && moves.length
      ? `近 1 個月雖然${verb}了 ${pp(r1m)}%，${moves.length} 個交易日裡有 ${downs} 天下跌、${ups} 天上漲，${why}。標準差看的是每天漲跌幅度「忽大忽小」的程度，不看方向：這段期間最大的一天是 ${fmtPct(best)}、最慘的一天是 ${fmtPct(worst)}，但和過去一年比沒有特別大，所以波動顯示「${volWord(vol)}」。看到波動不算激烈時，也要一起看漲跌幅。`
      : '';
  return (
    `${asset.name}（以 ${fmtDate(candles[f.target]!.time)} 收盤為準）：近 1 週 ${fmtPct(r1w)}、近 1 個月 ${fmtPct(r1m)}、近 3 個月 ${fmtPct(r3m)}；` +
    `在 200 日均線${ma >= 0 ? '上方' : '下方'} ${pp(ma)}%；RSI ${fmtNum(rsi, 1)}（${rsiWord(rsi)}）；` +
    `最近 1 個月的波動是過去一年的 ${fmtNum(vol, 2)} 倍（${volWord(vol)}）${volNote}；離一年內最高點 ${fmtPct(dd)}。` +
    bigMove
  );
}

/**
 * 最像的日子其實也不太像時（例如現在一個月跌了兩成，相似的日子平均只跌 7%），提醒參考價值比較低。
 * 比較「漲跌、和均線的距離、離高點多遠」這幾個百分比的特徵：現在和相似日子平均的差距，
 * 超過這個特徵在歷史上的 1 個標準差（比特幣本來就波動大，所以用各自的標準差來量）就提醒。
 */
export function similarityNote(f: Forecast, labels: readonly { label: string; kind: string }[], limit = 1): string | null {
  let worst: { j: number; z: number; avg: number } | null = null;
  f.features.forEach((now, j) => {
    const sd = f.featureSd[j];
    if (labels[j]?.kind !== 'pct' || !sd) return;
    const avg = f.analogFeatures.reduce((a, row) => a + row[j]!, 0) / f.analogFeatures.length;
    const z = Math.abs(now - avg) / sd;
    if (!worst || z > worst.z) worst = { j, z, avg };
  });
  const w = worst as { j: number; z: number; avg: number } | null;
  if (!w || w.z < limit) return null;
  return `現在的狀況在過去很少見，最像的日子其實也沒有很像：例如「${labels[w.j]!.label}」現在是 ${fmtPct(f.features[w.j]!)}，相似日子的平均是 ${fmtPct(w.avg)}。相似的日子不夠像時，它們之後的走法參考價值比較低，實際的漲跌可能比預測範圍更極端。`;
}

export type CheckTone = 'good' | 'meh' | 'bad';

export interface CheckPoint {
  tone: CheckTone;
  title: string;
  detail: string;
}

/** 回頭檢驗的兩個重點，放在預測數字旁邊：猜漲跌準不準、範圍準不準 */
export function checkPoints(r: CheckResult): CheckPoint[] {
  const diff = r.hit - r.alwaysUp;
  const hit = fmtPct(r.hit, 0, false);
  const up = fmtPct(r.alwaysUp, 0, false);
  const cov = fmtPct(r.coverage, 0, false);
  const dirDetail = `過去 ${r.tests} 次猜對 ${hit}；每次都猜「漲」也能猜對 ${up}`;
  const dir: CheckPoint =
    diff >= 0.05
      ? { tone: 'good', title: '猜漲跌：有一點參考價值', detail: dirDetail }
      : diff > -0.03
        ? { tone: 'meh', title: '猜漲跌：沒有比較準', detail: dirDetail }
        : { tone: 'bad', title: '猜漲跌：不可靠', detail: dirDetail };
  const band: CheckPoint =
    r.coverage < 0.7
      ? { tone: 'bad', title: '範圍：估得太窄', detail: `實際只有 ${cov} 落在八成範圍裡（理想是 80%），真實的漲跌常常更大` }
      : r.coverage > 0.9
        ? { tone: 'meh', title: '範圍：偏寬、比較保守', detail: `實際有 ${cov} 落在八成範圍裡（理想是 80%）` }
        : { tone: 'good', title: '範圍：大致準確', detail: `實際有 ${cov} 落在八成範圍裡（理想是 80%）` };
  return [dir, band];
}

/**
 * 「所以這些數字要怎麼用？」：依照回頭檢驗的結果，告訴新手哪個數字比較值得參考。
 * 第一句講「上漲的比例」和中位數，第二句講「八成的情況落在」這個範圍。
 */
export function usageTips(r: CheckResult, tail?: { p10: number; min: number; span: string } | null): string[] {
  const [dir, band] = checkPoints(r);
  const first =
    dir!.tone === 'good'
      ? '「上漲的比例」過去有一點參考價值，但還是常常猜錯，不要只靠它決定買賣。'
      : '「上漲的比例」和中位數過去沒有比「一直猜漲」準，不要拿來當買賣訊號，看看就好。';
  const second =
    band!.tone === 'good'
      ? '比較有用的是「八成的情況落在」這個範圍：它大致抓得到之後可能漲跌多少，可以先想想「如果跌到範圍的下緣，我受得了嗎？」，再決定要投入多少。'
      : band!.tone === 'meh'
        ? '「八成的情況落在」這個範圍偏寬，實際上通常不會那麼極端，可以當成保守的估計，用來想想最壞的情況。'
        : '要注意實際的漲跌常常超出「八成的情況落在」這個範圍，想最壞的情況時，要預留比範圍更大的空間。' +
          (tail ? `可以參考：過去 5 年，任何一天之後 ${tail.span}，最差的一成是 ${fmtPct(tail.p10)} 以下，最差的一次是 ${fmtPct(tail.min)}。` : '');
  return [first, second];
}

/** 回頭檢驗的結論：和「一直猜漲」比，以及預測範圍準不準 */
export function summarizeCheck(r: CheckResult): string[] {
  const out: string[] = [];
  const diff = r.hit - r.alwaysUp;
  const head = `回頭檢驗：從 ${fmtDate(r.from)} 到 ${fmtDate(r.to)}，每週用同樣的方法預測「${r.horizon.label}」的漲跌，共 ${r.tests} 次，猜對 ${fmtPct(r.hit, 0, false)}`;
  if (diff >= 0.05) {
    out.push(`${head}，比一直猜「漲」（${fmtPct(r.alwaysUp, 0, false)}）多 ${pp(diff)} 個百分點：有一點參考價值，但仍然常常猜錯。`);
  } else if (diff > -0.03) {
    out.push(`${head}，和一直猜「漲」（${fmtPct(r.alwaysUp, 0, false)}）差不多。也就是說，用過去相似的走勢來猜漲跌，並沒有比較準。`);
  } else {
    out.push(`${head}，反而比一直猜「漲」（${fmtPct(r.alwaysUp, 0, false)}）還低。用過去相似的走勢來猜漲跌並不可靠。`);
  }
  if (r.coverage < 0.7) {
    out.push(
      `實際結果落在「八成範圍」裡的只有 ${fmtPct(r.coverage, 0, false)}（理想是 80%）：真實的漲跌常常超出這個範圍，要把可能的範圍想得更寬一點。`,
    );
  } else if (r.coverage > 0.9) {
    out.push(`實際結果落在「八成範圍」裡的有 ${fmtPct(r.coverage, 0, false)}（理想是 80%）：範圍估得偏寬，屬於保守的估計。`);
  } else {
    out.push(`實際結果落在「八成範圍」裡的比例是 ${fmtPct(r.coverage, 0, false)}，接近理想的 80%：「可能的範圍」比「會漲還是會跌」更值得參考。`);
  }
  return out;
}

/**
 * 過去 years 年裡，任何一天之後 bars 根 K 棒的漲跌：最差的一成（第 10 百分位數）和最差的一次。
 * 給「範圍估得太窄」時，新手想最壞情況用的參考。樣本不夠時回傳 null。
 */
export function historyTail(closes: number[], times: string[], bars: number, years = 5): { p10: number; min: number } | null {
  const n = closes.length;
  if (n === 0) return null;
  const last = times[n - 1]!;
  const start = `${Number(last.slice(0, 4)) - years}${last.slice(4)}`;
  const rets: number[] = [];
  for (let i = 0; i + bars < n; i++) {
    if (times[i]! < start) continue;
    rets.push(closes[i + bars]! / closes[i]! - 1);
  }
  if (rets.length < 50) return null;
  rets.sort((a, b) => a - b);
  return { p10: rets[Math.floor(rets.length * 0.1)]!, min: rets[0]! };
}
