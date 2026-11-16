import type { Candle } from '../../data/types';
import { fmtNum } from '../../data/format';
import { atrWilder, closes, ema, sma, stdev, validSlice, zip } from '../math/core';

/**
 * 「擠壓」有兩種常見的說法，本站兩張卡片都用預設參數一起判斷，說法才會一致：
 *   1. 布林通道的寬度接近最近半年最窄（最窄時的 1.05 倍以內）
 *   2. 布林通道（20 日、2 倍標準差）整個縮進肯特納通道（EMA20、2 倍 ATR10）裡
 */
export const NEAR_MIN = 1.05;

export type SqueezeStatus = {
  /** 寬度是最近半年最窄時的幾倍 */
  vsMin: number;
  /** 寬度是最近半年最寬時的幾倍 */
  vsMax: number;
  /** 說法 1 */
  nearMin: boolean;
  /** 說法 2 */
  inside: boolean;
  bu: number;
  bl: number;
  ku: number;
  kl: number;
};

export function squeezeStatus(candles: Candle[]): SqueezeStatus | null {
  const n = candles.length;
  // 和兩個指標的預設算法一樣（這裡自己算，避免兩個指標的檔案互相引用）
  const close = closes(candles);
  const mid = sma(close, 20);
  const sd = stdev(close, 20);
  const upper = zip(mid, sd, (m, x) => m + 2 * x);
  const lower = zip(mid, sd, (m, x) => m - 2 * x);
  const widthLine = mid.map((m, i) => {
    const u = upper[i];
    const l = lower[i];
    return m == null || u == null || l == null || m === 0 ? null : ((u - l) / m) * 100;
  });
  const kMid = ema(close, 20);
  const atr = atrWilder(candles, 10);
  const w = widthLine[n - 1];
  const bu = upper[n - 1];
  const bl = lower[n - 1];
  const ku = zip(kMid, atr, (m, a) => m + 2 * a)[n - 1];
  const kl = zip(kMid, atr, (m, a) => m - 2 * a)[n - 1];
  const recent = validSlice(widthLine, n - 120, n);
  if (w == null || bu == null || bl == null || ku == null || kl == null || recent.length < 60) return null;
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  if (!(min > 0) || !(max > 0)) return null;
  return { vsMin: w / min, vsMax: w / max, nearMin: w <= min * NEAR_MIN, inside: bu < ku && bl > kl, bu, bl, ku, kl };
}

/** 兩張卡片共用的說明：兩種說法各自成不成立 */
export function squeezeText(s: SqueezeStatus, price: number): string {
  // 剛好縮進去一點點：上下軌最近的那一邊差不到股價的 0.2%
  const gap = Math.min(s.ku - s.bu, s.bl - s.kl);
  const edge = s.inside && gap / price < 0.002 ? `（最近的一邊只差 ${fmtNum(gap)}，剛好在邊緣，隔天很容易又不算）` : '';
  const width = `布林通道的寬度是最近半年最窄時的 ${fmtNum(s.vsMin, 2)} 倍（${NEAR_MIN} 倍以內算「接近半年最窄」）`;
  const box = `布林通道（${fmtNum(s.bl)}～${fmtNum(s.bu)}）${s.inside ? '整個縮在' : '沒有整個縮進'}肯特納通道（${fmtNum(s.kl)}～${fmtNum(s.ku)}）${s.inside ? '裡' : ''}${edge}`;
  const relative =
    '擠壓是「相對」的說法：最近 20 天收盤價的分散程度（布林通道），比每天盤中的平均震幅（ATR，肯特納通道）或比半年來的寬度窄，不代表整體的波動一定很小（ATR 頁、走勢預測頁比的是和過去一年比）。擠壓也不告訴你往哪邊走。';
  if (s.nearMin && s.inside) return ` 擠壓的兩種說法都成立：${width}，${box}。${relative}`;
  if (s.inside) return ` ${box}，算是肯特納通道說的「擠壓」；但${width}，還不算布林通道說的「擠壓」。兩種說法只有一種成立，要打折看。${relative}`;
  if (s.nearMin) return ` ${width}，算是布林通道說的「擠壓」；但${box}，還不算肯特納通道說的「擠壓」。兩種說法只有一種成立，要打折看。${relative}`;
  return ` 現在沒有「擠壓」：${width}，${box}。`;
}
