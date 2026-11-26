import { describe, expect, it } from 'vitest';
import { toCompact } from '../../data/extra';
import { describeOf, getIndicator } from '../registry';
import { syntheticCandles } from '../testUtils';
import { FUNDING_STALE_REASON, staleSummary } from './common';

describe('比特幣額外資料停更時', () => {
  // 合成 K 棒，日期改成連續的每一天
  const candles = syntheticCandles(120).map((c, i) => ({ ...c, time: new Date(Date.UTC(2026, 7, 1) + i * 86400000).toISOString().slice(0, 10) }));
  const stopAt = candles.length - 27; // 資料停在 27 天前
  const funding = toCompact(
    candles.slice(0, stopAt).map((c) => c.time),
    candles.slice(0, stopAt).map(() => 0.0001),
  );
  const ctx = { extra: { schemaVersion: 1 as const, asset: 'BTC', updatedAt: '', series: { funding: { label: '', unit: '', source: '', ...funding } } } };

  it('資金費率卡片寫出資料停在哪天、為什麼，標成「資料舊」，不拿舊資料說現在', () => {
    const def = getIndicator('funding')!;
    const d = describeOf({ def, params: def.defaults, result: def.compute(candles, def.defaults, ctx) }, candles)!;
    const last = candles[stopAt - 1]!.time;
    expect(d.headline).toBe(`資料停在 ${Number(last.slice(5, 7))}/${Number(last.slice(8, 10))}`);
    expect(d.stale).toBe(true);
    expect(d.tone).toBe('neutral');
    expect(d.detail).toContain(FUNDING_STALE_REASON);
    expect(d.detail).toContain('先不判斷');
  });

  it('資料夠新（7 根以內）或完全沒有資料時不算停更', () => {
    const vals = candles.map((_, i) => (i < candles.length - 3 ? 1 : null));
    expect(staleSummary(vals, candles)).toBeNull();
    expect(staleSummary(candles.map(() => null), candles)).toBeNull();
  });
});
