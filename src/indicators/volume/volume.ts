import { fmtCompact, fmtNum } from '../../data/format';
import { sma } from '../math/core';
import { getLine, notesOf, type IndicatorDef, type Series } from '../types';

export type VolumeParams = { ma1: number; ma2: number };

const md = (time: string) => `${Number(time.slice(5, 7))}/${Number(time.slice(8, 10))}`;

/**
 * 最近一次爆量（成交量 ≥ 均量 2 倍）：放量是從哪一根開始的，以及放量之前的均量。
 * 爆量那幾天會把最近的均量拉高，所以「量有沒有縮回來」要和放量之前的均量比。
 * lookback：只看最近幾根（太久以前的爆量就不提了）。
 */
/** 放量之後「回到平常」：連續 2 天都在放量之前均量的 1.3 倍以內 */
export const CALM_RATIO = 1.3;
export const CALM_DAYS = 2;

export type Spike = {
  /** 這一波放量開始的那天 */
  start: number;
  /** 放量之前（start 的前一天為止）的均量 */
  base: number;
  /** 量回到平常的第一天（連續 CALM_DAYS 天在 base 的 CALM_RATIO 倍以內）；還沒回到平常就沒有 */
  calm?: number;
  /** 回到平常之後又放大（base 的 CALM_RATIO 倍以上）的第一天：算新的一波 */
  again?: number;
};

/**
 * 最近 lookback 天裡最早的一次爆量（≥ 均量 2 倍），往前找這一波放量（≥ 1.3 倍）的開始，
 * 再往後看量有沒有回到平常、回到平常之後有沒有又放大。
 * 用最早的那次，是因為新的一波常常只和被拉高的均量比、看起來沒有爆量。
 */
export function recentSpike(volumes: readonly number[], avg: Series, n: number, lookback = 10, period = 20): Spike | null {
  const big = (i: number, k: number) => {
    const a = avg[i];
    return a != null && a > 0 && volumes[i]! >= k * a;
  };
  let first = -1;
  for (let i = Math.max(1, n - lookback); i <= n - 1; i++) {
    if (big(i, 2)) {
      first = i;
      break;
    }
  }
  if (first < 0) return null;
  // 往前找這一波放量（≥ 1.3 倍）是從哪一天開始的
  const waveStart = (i: number) => {
    let s = i;
    while (s - 1 >= 1 && big(s - 1, 1.3)) s--;
    return s;
  };
  let start = waveStart(first);
  // 放量之前的 period 天裡如果還有更早的爆量，那時的均量已經被拉高了：改用更早那一波放量之前的均量。
  // 只追最近 period 天裡的爆量（更早的放量已經不在現在的均量裡，不用管）
  for (let k = 0; k < 3; k++) {
    let earlier = -1;
    for (let j = Math.max(1, start - period, n - period); j < start; j++) {
      if (big(j, 2)) {
        earlier = j;
        break;
      }
    }
    if (earlier < 0) break;
    first = earlier;
    start = waveStart(earlier);
  }
  const base = avg[start - 1];
  if (base == null || base <= 0) return null;
  const spike: Spike = { start, base };
  let run = 0;
  for (let i = first + 1; i <= n - 1; i++) {
    const r = volumes[i]! / base;
    if (spike.calm == null) {
      run = r <= CALM_RATIO ? run + 1 : 0;
      if (run >= CALM_DAYS) spike.calm = i - CALM_DAYS + 1;
    } else if (r >= CALM_RATIO) {
      spike.again = i;
      break;
    }
  }
  return spike;
}

/** 過去一年，週末的平均成交量比平日少幾成（0.4 = 少 4 成）；週末或平日的資料太少就不算 */
export function weekendVolumeGap(candles: readonly { time: string; volume: number }[]): number | null {
  let we = 0, wd = 0, nWe = 0, nWd = 0;
  for (const c of candles.slice(-365)) {
    const d = new Date(`${c.time}T00:00:00Z`).getUTCDay();
    if (d === 0 || d === 6) (we += c.volume), nWe++;
    else (wd += c.volume), nWd++;
  }
  if (nWe < 20 || nWd < 50 || wd <= 0) return null;
  return 1 - we / nWe / (wd / nWd);
}

export const volumeIndicator: IndicatorDef<VolumeParams> = {
  id: 'volume',
  shortName: '成交量',
  name: '成交量與均量線',
  enName: 'Volume',
  category: 'volume',
  placement: 'pane',
  params: [
    { key: 'ma1', type: 'number', label: '短均量天數（0 = 不顯示）', min: 0, max: 60, step: 1 },
    { key: 'ma2', type: 'number', label: '長均量天數', min: 2, max: 120, step: 1 },
  ],
  defaults: { ma1: 5, ma2: 20 },
  compute(candles, p, ctx) {
    const vol: Series = candles.map((c) => c.volume);
    const lines: ReturnType<IndicatorDef['compute']>['lines'] = [
      {
        key: 'vol',
        label: '成交量',
        values: vol,
        kind: 'histogram',
        color: 'up',
        colors: candles.map((c) => (c.close >= c.open ? 'up' : 'down')),
        unit: 'volume',
      },
    ];
    if (p.ma1 > 1) {
      lines.push({ key: 'ma1', label: `均量 ${p.ma1}`, values: sma(vol, p.ma1), kind: 'line', color: 's0', width: 1, unit: 'volume' });
    }
    lines.push({ key: 'ma2', label: `均量 ${p.ma2}`, values: sma(vol, p.ma2), kind: 'line', color: 's1', width: 1, unit: 'volume' });
    return ctx?.volume ? { lines, volumeUnit: ctx.volume } : { lines };
  },
  describe(candles, r, p) {
    const n = candles.length;
    if (n < 2) return null;
    const v = candles[n - 1]!.volume;
    const avg = getLine(r, 'ma2')[n - 1];
    if (avg == null || avg <= 0 || v <= 0) return null;
    const ratio = v / avg;
    // 漲跌不到 0.1% 算持平（例如只差 1 美元的十字線，不要說成「價漲」）
    const chg = candles[n - 1]!.close / candles[n - 2]!.close - 1;
    const up = chg >= 0.001;
    const down = chg <= -0.001;
    const unit = r.volumeUnit;
    const amount = (x: number) => {
      if (!unit) return '';
      const scaled = x / unit.divisor;
      return `${scaled >= 10000 ? fmtCompact(scaled) : fmtNum(scaled, 0)} ${unit.unit}`;
    };
    // 說明裡寫最後一根 K 棒的日期，不寫「今天」：總覽用的是最後一根已收盤的 K 棒，週末或盤中時那根不是今天
    const day = md(candles[n - 1]!.time);
    // 比特幣週末的成交量比平日少（只有比特幣有週末的 K 棒）
    const dayOf = (t: string) => new Date(`${t}T00:00:00Z`).getUTCDay();
    const isWeekendDay = (t: string) => dayOf(t) === 0 || dayOf(t) === 6;
    const isWeekend = isWeekendDay(candles[n - 1]!.time);
    // 最近兩週有週末的 K 棒，就是全年無休的市場（比特幣），不是 ETF
    const alwaysOpen = candles.slice(-14).some((c) => isWeekendDay(c.time));
    const weekendGap = alwaysOpen ? weekendVolumeGap(candles) : null;
    // 資料不夠算、或週末其實沒有比較少，就不提
    const weekendBase = weekendGap !== null && weekendGap > 0.05 ? `過去一年，比特幣週末的平均成交量比平日少 ${fmtNum(weekendGap * 100, 0)}%` : '';
    const weekend = !isWeekend || !weekendBase
      ? ''
      : ratio >= 1.3
        ? `${day} 是週末。${weekendBase}，均量裡大多是平日的量；週末還能放量到均量的 ${fmtNum(ratio, 2)} 倍，和平常的週末比放大得更多。`
        : `${day} 是週末。${weekendBase}，所以週末量縮不一定代表什麼。`;
    const level = ratio >= 2 ? '爆量' : ratio >= 1.3 ? '量增' : ratio <= 0.6 ? '量縮' : '量能持平';
    const priceWord = up ? '價漲' : down ? '價跌' : '價平';
    const spike = recentSpike(
      candles.map((c) => c.volume),
      getLine(r, 'ma2'),
      n,
      10,
      p.ma2,
    );
    let tone: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let comment = '量能沒有特別放大，訊息有限。';
    // 放量下跌之後怎麼觀察、爆量後的量縮怎麼看：比較長，放在補充說明
    let watch = '';
    let shrink = '';
    if (ratio >= 1.3 && up) {
      tone = 'bullish';
      comment = '上漲時成交量放大，代表買盤積極，上漲比較有說服力。';
    } else if (ratio >= 1.3 && down) {
      tone = 'bearish';
      comment = '下跌時成交量放大，代表賣壓沉重；也有另一種可能：大家恐慌性地賣，賣完反而接近短期低點。';
      watch = `一種常見的做法是再觀察 3～5 個交易日（從這一波開始放量的那天算起；量回到平常之後又放大，就算新的一波）：如果量縮回爆量之前的 ${p.ma2} 日均量附近（爆量那幾天會把最近的均量拉高，所以要和爆量前比）、價格不再創新低，比較像賣壓出清；如果繼續放量下跌，就是賣壓還沒結束。這是經驗上的做法，本站沒有回測過，不保證準。`;
    } else if (ratio <= 0.6) {
      comment = up ? '上漲但量縮，追價意願不強。' : down ? '下跌但量縮，賣壓可能正在減輕。' : '交易清淡，市場在觀望。';
      // 爆量之後的「量縮」：只是和被拉高的均量比；和放量之前比已經回到平常，就不要說成追價意願不強
      if (spike && v / spike.base >= 0.7) {
        comment = `這裡的「量縮」是和被爆量拉高的均量比；和放量之前比，${day} 是 ${fmtNum(v / spike.base, 2)} 倍，在平常的範圍裡。`;
        shrink = `最近 ${p.ma2} 天的均量包含爆量那幾天，所以 ${day} 看起來是量縮。爆量之後量縮回平常、價格又沒有再創新低，比較像賣壓出清${up ? '，所以這時的「上漲但量縮」不一定是追價意願不強' : ''}。`;
      }
    }
    // 一價到底（開高低收都一樣）而且漲跌將近 10%：台股整天鎖在漲停（跌停）價，量少是因為沒人肯賣（買）
    const last = candles[n - 1]!;
    const locked = last.open === last.high && last.high === last.low && last.low === last.close && Math.abs(chg) >= 0.095;
    let lockedHistory = '';
    if (locked) {
      // 這份資料裡過去有幾天一字漲停（跌停），之後隔天怎麼走
      let cnt = 0;
      let nextUp = 0;
      for (let i = 1; i < n - 1; i++) {
        const c0 = candles[i]!;
        const ch = c0.close / candles[i - 1]!.close - 1;
        if (!(c0.open === c0.high && c0.high === c0.low && c0.low === c0.close && Math.abs(ch) >= 0.095 && ch > 0 === up)) continue;
        cnt++;
        if (candles[i + 1]!.close > c0.close) nextUp++;
      }
      lockedHistory =
        cnt === 0
          ? `這份資料裡，在 ${day} 之前沒有出現過一字${up ? '漲' : '跌'}停，沒有過去的例子可以參考之後通常怎麼走。`
          : `這份資料裡，在 ${day} 之前一字${up ? '漲' : '跌'}停出現過 ${cnt} 天，隔天收盤比較高的有 ${nextUp} 天${cnt < 10 ? '；次數太少，看不出之後通常怎麼走' : ''}。`;
      tone = up ? 'bullish' : 'bearish';
      comment = up
        ? `${day} 開盤、最高、最低、收盤都是 ${fmtNum(last.close)}，漲了 ${fmtNum(chg * 100, 2)}%：台股一天最多漲跌 10%，這是整天鎖在漲停價（叫「一字漲停」），想買的人很多、幾乎沒人肯賣，所以成交很少。這時的量少不代表追價意願不強。`
        : `${day} 開盤、最高、最低、收盤都是 ${fmtNum(last.close)}，跌了 ${fmtNum(Math.abs(chg) * 100, 2)}%：台股一天最多漲跌 10%，這是整天鎖在跌停價（叫「一字跌停」），想賣的人很多、幾乎沒人肯買，所以成交很少。這時的量少不代表賣壓減輕。`;
      shrink = '';
    }
    // 漲跌是和前一天收盤比，K 棒的紅綠是和當天開盤比：兩個可能不一樣
    const colorNote =
      !locked && ((up && last.close < last.open) || (down && last.close > last.open))
        ? `這裡的「價${up ? '漲' : '跌'}」是和前一天的收盤比（${up ? '漲' : '跌'} ${fmtNum(Math.abs(chg) * 100, 2)}%）；K 棒的紅綠是和當天的開盤比，${day} 收盤${last.close < last.open ? '比開盤低，所以是綠 K' : '比開盤高，所以是紅 K'}（${up ? '開盤就跳空開高、之後往下' : '開盤就跳空開低、之後往上'}）。兩個比的對象不同，所以可能一個說${up ? '漲' : '跌'}、K 棒卻是${last.close < last.open ? '綠' : '紅'}的。`
        : '';
    let wave = '';
    let twoRatios = '';
    if (spike) {
      const x = v / spike.base;
      const before = md(candles[spike.start - 1]!.time);
      const vsBase = unit
        ? `放量之前（${before} 為止）的 ${p.ma2} 日均量是 ${amount(spike.base)}，${day} 是 ${amount(v)}，是它的 ${fmtNum(x, 2)} 倍。`
        : `${day} 的量是放量之前（${before} 為止）${p.ma2} 日均量的 ${fmtNum(x, 2)} 倍。`;
      const calmRule = `（本站的算法：連續 ${CALM_DAYS} 天都在放量之前均量的 ${CALM_RATIO} 倍以內，就算回到平常）`;
      twoRatios = `前面的 ${fmtNum(ratio, 2)} 倍是和最近 ${p.ma2} 天的均量比，但這 ${p.ma2} 天包含爆量那幾天、均量被拉高了；${fmtNum(x, 2)} 倍是和放量之前比，比較看得出 ${day} 的量到底有多大。之後看量有沒有縮回來，就看後面這個數字：降到 1 倍左右，才算回到爆量之前的水準。`;
      if (spike.again != null) {
        wave = `上一波放量從 ${md(candles[spike.start]!.time)} 開始，${md(candles[spike.calm!]!.time)} 起量就回到平常${calmRule}；${md(candles[spike.again]!.time)} 又放大到放量之前的 ${CALM_RATIO} 倍以上，算是新的一波，「再觀察 3～5 個交易日」要從 ${md(candles[spike.again]!.time)} 重新算。現在的 ${p.ma2} 日均量還包含上一波爆量的那幾天，所以還是和上一波放量之前比：${vsBase}`;
      } else if (spike.calm != null) {
        wave = `這一波放量從 ${md(candles[spike.start]!.time)} 開始，${md(candles[spike.calm]!.time)} 起量已經回到平常${calmRule}。${vsBase}`;
      } else {
        wave = `這一波放量從 ${md(candles[spike.start]!.time)} 開始，量還沒有回到平常${calmRule}。${vsBase}`;
      }
    }
    // 「放量下跌後再觀察 3～5 個交易日」的兩個條件，照資料寫出觀察到現在的結果
    let verdict = '';
    if (spike) {
      const ws = spike.again ?? (spike.calm == null ? spike.start : null);
      if (ws != null && ws >= 1 && candles[ws]!.close < candles[ws - 1]!.close) {
        const days = n - ws;
        let lowIdx = ws;
        for (let i = ws; i < n; i++) if (candles[i]!.close < candles[lowIdx]!.close) lowIdx = i;
        const x = v / spike.base;
        // 「量縮回來」用和「回到平常」一樣的算法：最近 CALM_DAYS 天都在放量前均量的 CALM_RATIO 倍以內，不能只看今天
        const lastDays = Array.from({ length: CALM_DAYS }, (_, k) => n - CALM_DAYS + k).filter((i) => i >= ws);
        const ratios = lastDays.map((i) => candles[i]!.volume / spike.base);
        const volBack = lastDays.length === CALM_DAYS && ratios.every((y) => y <= CALM_RATIO);
        const prevRatio = ratios.length >= 2 ? ratios[ratios.length - 2]! : null;
        const volText = volBack
          ? `已經縮回放量前均量附近（最近 ${CALM_DAYS} 天是 ${ratios.map((y) => fmtNum(y, 2)).join('、')} 倍，都在 ${CALM_RATIO} 倍以內）`
          : x <= CALM_RATIO && prevRatio != null
            ? `${day} 縮到放量前均量的 ${fmtNum(x, 2)} 倍，但前一天還是 ${fmtNum(prevRatio, 2)} 倍；本站的算法要連續 ${CALM_DAYS} 天都在 ${CALM_RATIO} 倍以內才算縮回來，所以還不算`
            : `還沒縮回來（是放量前均量的 ${fmtNum(x, 2)} 倍）`;
        const noNewLow = lowIdx < n - 1;
        if (days >= 3) {
          verdict = locked
            ? `這一波放量下跌從 ${md(candles[ws]!.time)} 算到 ${day} 是第 ${days} 個交易日。${day} 是一字${up ? '漲' : '跌'}停，量少是因為整天鎖在${up ? '漲' : '跌'}停價、成交不了，不能拿來判斷量有沒有縮回來，要看之後幾天的量。`
            : `這一波放量下跌從 ${md(candles[ws]!.time)} 算到 ${day} 是第 ${days} 個交易日（一種常見的做法是觀察 3～5 個交易日）。照那兩個條件看：量${volText}；這一波收盤最低是 ${md(candles[lowIdx]!.time)} 的 ${fmtNum(candles[lowIdx]!.close)}，${noNewLow ? '之後沒有再創新低' : `${day} 又創了這一波的新低`}。${volBack && noNewLow ? '兩個條件都符合，照這個經驗看法比較像賣壓出清。' : '兩個條件沒有都符合，照這個看法還不能說賣壓出清。'}${days > 5 ? '已經超過 3～5 天：這個經驗看法只講到 3～5 天，沒有說超過之後怎麼判斷；本站每天還是照同樣兩個條件更新結果，不另外下結論。' : ''}這是經驗上的看法，本站沒有回測過，不保證準。`;
        }
      }
    }
    // 沒有爆量（2 倍）但前幾天量明顯放大：寫出來，免得看圖覺得放量、卡片卻沒提
    let recent = '';
    if (!spike) {
      const ma = getLine(r, 'ma2');
      let bi = -1;
      let br = 0;
      for (let i = Math.max(1, n - 6); i < n - 1; i++) {
        const a = ma[i];
        if (a == null || a <= 0) continue;
        const x = candles[i]!.volume / a;
        if (x > br) (br = x), (bi = i);
      }
      if (bi >= 0 && br >= 1.5) {
        recent = `最近幾天量最大的是 ${md(candles[bi]!.time)}，是當時 ${p.ma2} 日均量的 ${fmtNum(br, 2)} 倍，算量增，還不到爆量（本站把 2 倍以上算爆量）。`;
      }
    }
    return {
      tone,
      headline: `${priceWord}${level}（${fmtNum(ratio, 2)} 倍均量）`,
      detail: `${day} 的成交量${unit ? `（${amount(v)}）` : ''}是 ${p.ma2} 日均量${unit ? `（${amount(avg)}）` : ''}的 ${fmtNum(ratio, 2)} 倍。${comment}`,
      notes: notesOf(
        ['這一波放量從哪天開始', wave],
        ['前幾天的量', recent],
        ['過去的一字漲跌停', lockedHistory],
        ['漲跌和 K 棒顏色', colorNote],
        ['幾倍算量增、爆量', `本站的分法（和最近 ${p.ma2} 天的均量比）：2 倍以上算爆量，1.3 倍以上算量增，0.6 倍以下算量縮，中間算持平。${day} 是 ${fmtNum(ratio, 2)} 倍。這是本站為了說明訂的門檻，各家看盤軟體不一定一樣。`],
        ['放量下跌之後怎麼觀察', watch],
        ['觀察到現在的結果', verdict],
        ['爆量之後的量縮怎麼看', shrink],
        ['兩個倍數差在哪裡', twoRatios],
        ['週末的量', weekend],
        ['ETF 的成交量', ratio >= 1.3 && !alwaysOpen && '0050、VOO 這類 ETF 有造市商（負責隨時報價買賣的券商），成交量不完全代表投資人的買賣意願，量的訊號只能參考。'],
      ),
    };
  },
  noSignalReason:
    '成交量本身沒有方向，要搭配價格一起看（例如「價漲量增」比「價漲量縮」健康），所以不單獨產生買賣訊號。',
};
