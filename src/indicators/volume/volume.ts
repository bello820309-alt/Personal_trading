import { fmtCompact, fmtNum } from '../../data/format';
import { sma } from '../math/core';
import { getLine, type IndicatorDef, type Series } from '../types';

export type VolumeParams = { ma1: number; ma2: number };

const md = (time: string) => `${Number(time.slice(5, 7))}/${Number(time.slice(8, 10))}`;

/**
 * 最近一次爆量（成交量 ≥ 均量 2 倍）：放量是從哪一根開始的，以及放量之前的均量。
 * 爆量那幾天會把最近的均量拉高，所以「量有沒有縮回來」要和放量之前的均量比。
 * lookback：只看最近幾根（太久以前的爆量就不提了）。
 */
export function recentSpike(volumes: readonly number[], avg: Series, n: number, lookback = 10): { start: number; base: number } | null {
  const big = (i: number, k: number) => {
    const a = avg[i];
    return a != null && a > 0 && volumes[i]! >= k * a;
  };
  let last = -1;
  for (let i = n - 1; i >= Math.max(1, n - lookback); i--) {
    if (big(i, 2)) {
      last = i;
      break;
    }
  }
  if (last < 0) return null;
  // 往前找這一波放量（≥ 1.3 倍）是從哪一天開始的
  let start = last;
  while (start - 1 >= 1 && big(start - 1, 1.3)) start--;
  const base = avg[start - 1];
  return base != null && base > 0 ? { start, base } : null;
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
    // 比特幣週末的成交量通常比平日少三、四成（只有比特幣有週末的 K 棒）
    const weekday = new Date(`${candles[n - 1]!.time}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? ' 今天是週末：比特幣週末的成交量通常比平日少三、四成，週末量縮不一定代表什麼。' : '';
    const level = ratio >= 2 ? '爆量' : ratio >= 1.3 ? '量增' : ratio <= 0.6 ? '量縮' : '量能持平';
    const priceWord = up ? '價漲' : down ? '價跌' : '價平';
    let tone: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let comment = '量能沒有特別放大，訊息有限。';
    if (ratio >= 1.3 && up) {
      tone = 'bullish';
      comment = '上漲時成交量放大，代表買盤積極，上漲比較有說服力。（0050、VOO 這類 ETF 有造市商，量的訊號只能參考。）';
    } else if (ratio >= 1.3 && down) {
      tone = 'bearish';
      comment = '下跌時成交量放大，代表賣壓沉重。也有另一種可能：大家恐慌性地賣，賣完反而接近短期低點。常見的看法是再觀察 3～5 個交易日：如果量縮回爆量之前的 20 日均量附近（爆量那幾天會把最近的均量拉高，所以要和爆量前比）、價格不再創新低，比較像賣壓出清；如果繼續放量下跌，就是賣壓還沒結束。這只是常見的經驗，不保證準。（0050、VOO 這類 ETF 有造市商，量的訊號只能參考。）';
    } else if (ratio <= 0.6) {
      comment = up ? '上漲但量縮，追價意願不強。' : down ? '下跌但量縮，賣壓可能正在減輕。' : '交易清淡，市場在觀望。';
    }
    const spike = recentSpike(
      candles.map((c) => c.volume),
      avg === undefined ? [] : getLine(r, 'ma2'),
      n,
    );
    const spikeText = spike
      ? ` 這一波放量從 ${md(candles[spike.start]!.time)} 開始。${
          unit
            ? `放量之前（${md(candles[spike.start - 1]!.time)} 為止）的 ${p.ma2} 日均量是 ${amount(spike.base)}，今天 ${amount(v)}，是它的 ${fmtNum(v / spike.base, 1)} 倍。`
            : `今天的量是放量之前（${md(candles[spike.start - 1]!.time)} 為止）${p.ma2} 日均量的 ${fmtNum(v / spike.base, 1)} 倍。`
        }兩個倍數差在比的對象：前面的 ${fmtNum(ratio, 1)} 倍是和最近 ${p.ma2} 天的均量比，但這 ${p.ma2} 天已經包含爆量那幾天、均量被拉高了；${fmtNum(v / spike.base, 1)} 倍是和放量之前比，比較看得出今天的量到底有多大。之後看量有沒有縮回來，就看這個數字：降到 1 倍左右，才算回到爆量之前的水準。`
      : '';
    return {
      tone,
      headline: `${priceWord}${level}（${fmtNum(ratio, 1)} 倍均量）`,
      detail: `今天的成交量${unit ? `（${amount(v)}）` : ''}是 ${p.ma2} 日均量${unit ? `（${amount(avg)}）` : ''}的 ${fmtNum(ratio, 2)} 倍。${comment}${spikeText}${weekend}`,
    };
  },
  noSignalReason:
    '成交量本身沒有方向，要搭配價格一起看（例如「價漲量增」比「價漲量縮」健康），所以不單獨產生買賣訊號。',
};
