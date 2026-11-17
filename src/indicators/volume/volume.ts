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
export function recentSpike(volumes: readonly number[], avg: Series, n: number, lookback = 10): Spike | null {
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
  let start = first;
  while (start - 1 >= 1 && big(start - 1, 1.3)) start--;
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
        ? `今天是週末。${weekendBase}，均量裡大多是平日的量；週末還能放量到均量的 ${fmtNum(ratio, 2)} 倍，和平常的週末比放大得更多。`
        : `今天是週末。${weekendBase}，所以週末量縮不一定代表什麼。`;
    const level = ratio >= 2 ? '爆量' : ratio >= 1.3 ? '量增' : ratio <= 0.6 ? '量縮' : '量能持平';
    const priceWord = up ? '價漲' : down ? '價跌' : '價平';
    const spike = recentSpike(
      candles.map((c) => c.volume),
      getLine(r, 'ma2'),
      n,
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
        comment = `這裡的「量縮」是和被爆量拉高的均量比；和放量之前比是 ${fmtNum(v / spike.base, 1)} 倍，算是回到平常的水準。`;
        shrink = `最近 ${p.ma2} 天的均量包含爆量那幾天，所以今天看起來是量縮。爆量之後量縮回平常、價格又沒有再創新低，比較像賣壓出清${up ? '，所以這時的「上漲但量縮」不一定是追價意願不強' : ''}。`;
      }
    }
    let wave = '';
    let twoRatios = '';
    if (spike) {
      const x = v / spike.base;
      const before = md(candles[spike.start - 1]!.time);
      const vsBase = unit
        ? `放量之前（${before} 為止）的 ${p.ma2} 日均量是 ${amount(spike.base)}，今天 ${amount(v)}，是它的 ${fmtNum(x, 1)} 倍。`
        : `今天的量是放量之前（${before} 為止）${p.ma2} 日均量的 ${fmtNum(x, 1)} 倍。`;
      const calmRule = `（本站的算法：連續 ${CALM_DAYS} 天都在放量之前均量的 ${CALM_RATIO} 倍以內，就算回到平常）`;
      twoRatios = `前面的 ${fmtNum(ratio, 1)} 倍是和最近 ${p.ma2} 天的均量比，但這 ${p.ma2} 天包含爆量那幾天、均量被拉高了；${fmtNum(x, 1)} 倍是和放量之前比，比較看得出今天的量到底有多大。之後看量有沒有縮回來，就看後面這個數字：降到 1 倍左右，才算回到爆量之前的水準。`;
      if (spike.again != null) {
        wave = `上一波放量從 ${md(candles[spike.start]!.time)} 開始，${md(candles[spike.calm!]!.time)} 起量就回到平常${calmRule}；${md(candles[spike.again]!.time)} 又放大到放量之前的 ${CALM_RATIO} 倍以上，算是新的一波，「再觀察 3～5 個交易日」要從 ${md(candles[spike.again]!.time)} 重新算。現在的 ${p.ma2} 日均量還包含上一波爆量的那幾天，所以還是和上一波放量之前比：${vsBase}`;
      } else if (spike.calm != null) {
        wave = `這一波放量從 ${md(candles[spike.start]!.time)} 開始，${md(candles[spike.calm]!.time)} 起量已經回到平常${calmRule}。${vsBase}`;
      } else {
        wave = `這一波放量從 ${md(candles[spike.start]!.time)} 開始，量還沒有回到平常${calmRule}。${vsBase}`;
      }
    }
    return {
      tone,
      headline: `${priceWord}${level}（${fmtNum(ratio, 1)} 倍均量）`,
      detail: `今天的成交量${unit ? `（${amount(v)}）` : ''}是 ${p.ma2} 日均量${unit ? `（${amount(avg)}）` : ''}的 ${fmtNum(ratio, 2)} 倍。${comment}`,
      notes: notesOf(
        ['這一波放量從哪天開始', wave],
        ['放量下跌之後怎麼觀察', watch],
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
