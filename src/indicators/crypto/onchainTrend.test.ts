import { describe, expect, it } from 'vitest';
import type { ExtraDataFile } from '../../data/extra';
import type { Candle } from '../../data/types';
import { activeAddressesIndicator } from './onchainTrend';

/* 短、長均線差不到 1% 時，不要說成明顯的轉強或轉弱 */

const bars = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10), open: 1, high: 1, low: 1, close: 1, volume: 1 }));
const extra = (v: number[]) =>
  ({ schemaVersion: 1, asset: 'BTC', updatedAt: '', series: { activeAddresses: { label: '', unit: '', source: '', start: '2026-01-01', v } } }) as unknown as ExtraDataFile;

describe('鏈上指標的短長均線', () => {
  const p = activeAddressesIndicator.defaults;

  it('差 0.4%：說差不多，不標偏多偏空', () => {
    // 前 60 天 1000，最後 30 天 996（30 日平均比 90 日平均低約 0.27%）
    const v = [...Array(60).fill(1000), ...Array(30).fill(996)];
    const c = bars(90);
    const d = activeAddressesIndicator.describe!(c, activeAddressesIndicator.compute(c, p, { extra: extra(v) }), p)!;
    expect(d.tone).toBe('neutral');
    expect(d.headline).toContain('短期和長期差不多');
  });

  it('差距明顯時照常說轉弱', () => {
    const v = [...Array(60).fill(1000), ...Array(30).fill(900)];
    const c = bars(90);
    const d = activeAddressesIndicator.describe!(c, activeAddressesIndicator.compute(c, p, { extra: extra(v) }), p)!;
    expect(d.tone).toBe('bearish');
  });
});
