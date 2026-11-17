import { describe, expect, it } from 'vitest';
import { summaryText } from '../types';
import type { Candle } from '../../data/types';
import { recentSpike, volumeIndicator, weekendVolumeGap } from './volume';

/* 爆量之後，均量會被拉高：說明裡直接寫出「放量之前的均量」比較的倍數 */

const day = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);
const candles = (vols: number[], closes?: number[]): Candle[] =>
  vols.map((volume, i) => {
    const close = closes?.[i] ?? 100;
    return { time: day(i), open: close, high: close + 1, low: close - 1, close, volume };
  });

describe('最近的爆量', () => {
  it('找出放量從哪一天開始，以及放量之前的均量', () => {
    // 25 天平常的量 100，接著 2 天 150（1.3 倍以上）、1 天 600（爆量）
    const vols = [...Array(25).fill(100), 150, 150, 600];
    const c = candles(vols);
    const p = { ma1: 5, ma2: 20 };
    const r = volumeIndicator.compute(c, p);
    const avg = r.lines.find((l) => l.key === 'ma2')!.values;
    expect(recentSpike(vols, avg, vols.length)).toEqual({ start: 25, base: 100 });
    const d = volumeIndicator.describe!(c, r, p)!;
    expect(summaryText(d)).toContain('這一波放量從 10/26 開始');
    expect(summaryText(d)).toContain('放量之前（10/25 為止）20 日均量的 6.0 倍');
  });

  it('最近 10 天沒有爆量就不提', () => {
    const vols = [...Array(25).fill(100), 180, 120];
    const c = candles(vols);
    const p = { ma1: 5, ma2: 20 };
    const r = volumeIndicator.compute(c, p);
    expect(summaryText(volumeIndicator.describe!(c, r, p)!)).not.toContain('放量之前');
  });

  it('爆量過後量縮回來時，也寫出和放量之前比的倍數', () => {
    const vols = [...Array(25).fill(100), 500, 300, 110];
    const c = candles(vols);
    const p = { ma1: 5, ma2: 20 };
    const r = volumeIndicator.compute(c, p);
    expect(summaryText(volumeIndicator.describe!(c, r, p)!)).toContain('20 日均量的 1.1 倍');
  });

  it('帶入單位時寫出實際的量（台股以張為單位），並說明兩個倍數差在哪裡', () => {
    const vols = [...Array(25).fill(100_000), 150_000, 150_000, 600_000];
    const c = candles(vols);
    const p = { ma1: 5, ma2: 20 };
    const r = volumeIndicator.compute(c, p, { volume: { divisor: 1000, unit: '張' } });
    const d = summaryText(volumeIndicator.describe!(c, r, p)!);
    expect(d).toContain('放量之前（10/25 為止）的 20 日均量是 100 張，今天 600 張，是它的 6.0 倍');
    expect(d).toContain('6.0 倍是和放量之前比，比較看得出今天的量到底有多大');
  });

  // 全年無休的市場（比特幣）：平日量 100、週末量 60，最後一根是 2026/11/07（週六）
  const cryptoCandles = (lastVolume: number, lastClose = 10000): Candle[] => {
    const days = 200;
    const start = Date.UTC(2026, 10, 7) - (days - 1) * 86400000;
    return Array.from({ length: days }, (_, i) => {
      const t = new Date(start + i * 86400000);
      const weekend = t.getUTCDay() === 0 || t.getUTCDay() === 6;
      const last = i === days - 1;
      const close = last ? lastClose : 10000;
      return { time: t.toISOString().slice(0, 10), open: close, high: close + 1, low: close - 1, close, volume: last ? lastVolume : weekend ? 60 : 100 };
    });
  };

  it('漲跌不到 0.1% 算價平；比特幣週末量縮時，寫出週末平常少幾成（用資料算）', () => {
    const c = cryptoCandles(30, 10001);
    expect(c[c.length - 1]!.time).toBe('2026-11-07');
    const p = { ma1: 5, ma2: 20 };
    const d = volumeIndicator.describe!(c, volumeIndicator.compute(c, p), p)!;
    expect(d.headline.startsWith('價平')).toBe(true);
    expect(summaryText(d)).toMatch(/今天是週末。過去一年，比特幣週末的平均成交量比平日少 4\d%，所以週末量縮不一定代表什麼/);
    expect(weekendVolumeGap(c)!).toBeGreaterThan(0.38);
    expect(weekendVolumeGap(c)!).toBeLessThan(0.42);
  });

  it('比特幣週末放量時，說明週末本來量就少；全年無休的市場不寫 ETF 造市商', () => {
    const c = cryptoCandles(200);
    const p = { ma1: 5, ma2: 20 };
    const d = summaryText(volumeIndicator.describe!(c, volumeIndicator.compute(c, p), p)!);
    expect(d).toContain('週末還能放量到均量的');
    expect(d).not.toContain('週末量縮不一定代表什麼');
    expect(d).not.toContain('造市商');
  });

  it('週末的量沒有比平日少（或資料不夠）就不提週末', () => {
    const vols = [...Array(30).fill(100), 40];
    const c = candles(vols).map((x, i) => ({ ...x, time: new Date(Date.UTC(2026, 9, 8) + i * 86400000).toISOString().slice(0, 10) }));
    expect(c[c.length - 1]!.time).toBe('2026-11-07');
    const p = { ma1: 5, ma2: 20 };
    expect(summaryText(volumeIndicator.describe!(c, volumeIndicator.compute(c, p), p)!)).not.toContain('今天是週末');
    expect(weekendVolumeGap(c)).toBeNull();
  });

  it('量回到平常之後又放大，算新的一波，3～5 天從新的那天重新算', () => {
    // 平常 100 → 10/26 起放量（150、600、600）→ 10/29、10/30 回到 110、105（平常）→ 今天 300
    const vols = [...Array(25).fill(100), 150, 600, 600, 110, 105, 300];
    const closes = [...Array(30).fill(100), 95];
    const c = candles(vols, closes);
    const p = { ma1: 5, ma2: 20 };
    const r = volumeIndicator.compute(c, p);
    const avg = r.lines.find((l) => l.key === 'ma2')!.values;
    expect(recentSpike(vols, avg, vols.length)).toEqual({ start: 25, base: 100, calm: 28, again: 30 });
    const d = summaryText(volumeIndicator.describe!(c, r, p)!);
    expect(d).toContain('上一波放量從 10/26 開始，10/29 起量就回到平常');
    expect(d).toContain('10/31 又放大到放量之前的 1.3 倍以上，算是新的一波');
    expect(d).toContain('要從 10/31 重新算');
    expect(d).toContain('放量之前（10/25 為止）20 日均量的 3.0 倍');
  });

  it('只有一天回到平常不算；回到平常但還沒再放大時也寫出來', () => {
    const p = { ma1: 5, ma2: 20 };
    // 回到 110 只有一天，接著又 200：同一波還沒結束
    const a = [...Array(25).fill(100), 600, 110, 200];
    const ra = volumeIndicator.compute(candles(a), p);
    const sa = recentSpike(a, ra.lines.find((l) => l.key === 'ma2')!.values, a.length);
    expect(sa).toEqual({ start: 25, base: 100 });
    expect(summaryText(volumeIndicator.describe!(candles(a), ra, p)!)).toContain('量還沒有回到平常');
    // 連續 2 天回到平常
    const b = [...Array(25).fill(100), 600, 110, 100];
    const rb = volumeIndicator.compute(candles(b), p);
    expect(summaryText(volumeIndicator.describe!(candles(b), rb, p)!)).toContain('10/27 起量已經回到平常');
  });

  it('爆量之後量縮回平常：說明「量縮」是和被拉高的均量比，不說追價意願不強', () => {
    // 平常 100，爆量 3 天 600，之後回到 105（和放量之前比約 1.05 倍，和最近 20 天比是量縮）
    const vols = [...Array(25).fill(100), 600, 600, 600, 105];
    const closes = [...Array(28).fill(100), 101];
    const c = candles(vols, closes);
    const p = { ma1: 5, ma2: 20 };
    const d = volumeIndicator.describe!(c, volumeIndicator.compute(c, p), p)!;
    expect(d.headline).toContain('量縮');
    expect(summaryText(d)).toContain('和放量之前比是 1.1 倍，算是回到平常的水準');
    expect(summaryText(d)).not.toContain('上漲但量縮，追價意願不強');
    expect(summaryText(d)).toContain('不一定是追價意願不強');
  });
});
