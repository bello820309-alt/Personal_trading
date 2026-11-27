import { fmtNum } from '../data/format';
import type { Category, StateSummary, Tone } from './types';

/**
 * 總覽每個標的指標清單上方的「綜合判斷」：把「意見不一致時先看哪一個」的規則濃縮成一行。
 *   1. 先看 ADX：25 以上是趨勢盤（以趨勢指標為主）；20 以下是盤整（以擺盪指標為主）；中間兩類都要打折。
 *   2. 統計同一類指標的多空數量。
 *   3. 和主要那一類方向相反的指標點名出來，提醒要打折看。
 * 規則和總覽「這些標籤怎麼看？」、基礎觀念「趨勢、盤整與支撐壓力」寫的一樣，只是自動套到現在的數字上。
 */
export interface RegimeItem {
  name: string;
  category: Category;
  tone: Tone;
}

export const TONE_WORDS: Record<Tone, string> = { bullish: '偏多', bearish: '偏空', hot: '過熱', cold: '過冷', neutral: '中性' };

type Side = 'up' | 'down' | 'none';

/** 趨勢指標的方向 */
function trendSide(t: Tone): Side {
  return t === 'bullish' || t === 'hot' ? 'up' : t === 'bearish' || t === 'cold' ? 'down' : 'none';
}

/**
 * 擺盪指標偏向買還是賣（和趨勢比的時候）：
 * 趨勢偏多時，擺盪「過冷」是上升趨勢裡的回檔（偏向買，算一致）；趨勢偏空時，擺盪「過熱」是下跌趨勢裡的反彈（偏向賣，算一致）。
 */
function agrees(osc: Tone, trend: 'up' | 'down'): boolean | null {
  if (osc === 'neutral') return null;
  if (trend === 'up') return osc === 'bullish' || osc === 'cold';
  return osc === 'bearish' || osc === 'hot';
}

function count(items: RegimeItem[], pick: (t: Tone) => boolean) {
  return items.filter((x) => pick(x.tone)).length;
}

export function regimeSummary(items: RegimeItem[], adx: number | null): string | null {
  const trend = items.filter((x) => x.category === 'trend');
  const osc = items.filter((x) => x.category === 'momentum');
  if (adx == null || trend.length === 0) return null;
  const up = count(trend, (t) => trendSide(t) === 'up');
  const down = count(trend, (t) => trendSide(t) === 'down');
  const major: 'up' | 'down' | null = up > down ? 'up' : down > up ? 'down' : null;
  // 列出是哪幾個，新手才能自己對照下面的清單（偏多／偏空／中性各是誰）
  const names = (side: Side) => trend.filter((x) => trendSide(x.tone) === side).map((x) => x.name).join('、');
  const who = (['down', 'up', 'none'] as Side[])
    .filter((s) => names(s))
    .map((s) => `${s === 'up' ? '偏多' : s === 'down' ? '偏空' : '中性'}：${names(s)}`)
    .join('；');
  const trendText = major
    ? `${major === 'up' ? up : down}/${trend.length} 個趨勢指標${major === 'up' ? '偏多' : '偏空'}（${who}）`
    : `趨勢指標多空各半（${who}）`;
  const oscCounts = (['cold', 'bearish', 'bullish', 'hot'] as Tone[])
    .map((t) => [t, count(osc, (x) => x === t)] as const)
    .filter(([, c]) => c > 0)
    .map(([t, c]) => `${c} 個${TONE_WORDS[t]}`)
    .join('、');
  const oscText = osc.length ? `擺盪指標 ${osc.length} 個裡${oscCounts || '都是中性'}` : '';
  const head = `ADX ${fmtNum(adx, 1)}`;

  if (adx >= 25) {
    if (!major) return `${head} → 趨勢盤，以趨勢指標為主：但${trendText}，方向還不明確，先觀望。`;
    const against = osc.filter((x) => agrees(x.tone, major) === false);
    const names = against.map((x) => `${x.name}${TONE_WORDS[x.tone]}`).join('、');
    return `${head} → 趨勢盤，以趨勢指標為主：${trendText}。${
      names ? `${names}和趨勢方向不一致，在趨勢盤中要打折看。` : osc.length ? '擺盪指標沒有和趨勢方向相反的。' : ''
    }`;
  }
  if (adx < 20) {
    return `${head} → 盤整，以擺盪指標為主：${oscText || '沒有擺盪指標'}；趨勢指標（${trendText}）在盤整時要打折看。`;
  }
  // 20～25：趨勢正在形成或變弱，兩類都要打折，只採用意見一致的
  if (!major) return `${head} → 趨勢正在形成或變弱，兩類都要打折看：${trendText}，${oscText}；意見不一致，先觀望。`;
  const agreeCount = osc.filter((x) => agrees(x.tone, major)).length;
  const againstCount = osc.filter((x) => agrees(x.tone, major) === false).length;
  const verdict =
    agreeCount > againstCount ? '擺盪指標大多和趨勢方向一致' : againstCount > agreeCount ? '擺盪指標大多和趨勢方向相反，意見不一致，先觀望' : '兩類意見沒有一致，先觀望';
  return `${head} → 趨勢正在形成或變弱，兩類都要打折看：${trendText}，${oscText}；${verdict}。`;
}

/** 從總覽算好的指標狀態整理成 RegimeItem */
export function regimeItems(rows: { def: { shortName: string; category: Category }; d: StateSummary | null }[]): RegimeItem[] {
  return rows.flatMap(({ def, d }) => (d ? [{ name: def.shortName, category: def.category, tone: d.tone }] : []));
}
