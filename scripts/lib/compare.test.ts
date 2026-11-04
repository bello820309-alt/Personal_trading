import { describe, expect, it } from 'vitest';
import type { AssetDataFile } from '../../src/data/types';
import { restoreLostBars, sameMarketData } from './compare';
import { restoreLostFx } from './fx';

function file(days: [string, number][]): AssetDataFile {
  return {
    schemaVersion: 1,
    id: '0050',
    symbol: '0050.TW',
    source: 'Yahoo Finance',
    currency: 'TWD',
    timezone: 'Asia/Taipei',
    updatedAt: '2026-11-03T19:29:41.959Z',
    lastBarComplete: true,
    events: { dividends: [], splits: [] },
    bars: {
      t: days.map((d) => d[0]),
      o: days.map((d) => d[1]),
      h: days.map((d) => d[1] + 1),
      l: days.map((d) => d[1] - 1),
      c: days.map((d) => d[1]),
      v: days.map(() => 1000),
      ac: days.map((d) => d[1]),
    },
  };
}

describe('restoreLostBars：Yahoo 暫時少了最近的某一天', () => {
  const prev = file([['2026-10-30', 104.95], ['2026-11-02', 104.1], ['2026-11-03', 100.6]]);

  it('2026/11/4 凌晨的情況：這次只到 11/2，11/3 從上一版補回來', () => {
    const next = file([['2026-10-30', 104.95], ['2026-11-02', 104.1]]);
    const { file: f, restored } = restoreLostBars(prev, next);
    expect(restored).toEqual(['2026-11-03']);
    expect(f.bars.t).toEqual(['2026-10-30', '2026-11-02', '2026-11-03']);
    expect(f.bars.c.at(-1)).toBe(100.6);
    // 補回來之後和上一版一樣 → 不需要改檔案、不會產生 commit
    expect(sameMarketData(prev, f)).toBe(true);
  });

  it('中間少一天也補，新的日子照常加進來', () => {
    const next = file([['2026-10-30', 104.95], ['2026-11-03', 100.6], ['2026-11-04', 101.2]]);
    const { file: f, restored } = restoreLostBars(prev, next);
    expect(restored).toEqual(['2026-11-02']);
    expect(f.bars.t).toEqual(['2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('沒有少就原封不動；沒有上一版也不動', () => {
    const next = file([['2026-10-30', 104.95], ['2026-11-02', 104.1], ['2026-11-03', 100.6], ['2026-11-04', 101.2]]);
    expect(restoreLostBars(prev, next)).toEqual({ file: next, restored: [] });
    expect(restoreLostBars(null, next).restored).toEqual([]);
  });

  it('匯率也一樣', () => {
    const p = { schemaVersion: 1 as const, id: 'USDTWD', symbol: 'TWD=X', source: '', description: '', timezone: 'Europe/London', updatedAt: '', t: ['2026-11-02', '2026-11-03'], c: [32.6, 32.5] };
    const { file: f, restored } = restoreLostFx(p, { ...p, t: ['2026-11-02'], c: [32.6] });
    expect(restored).toEqual(['2026-11-03']);
    expect(f.t).toEqual(['2026-11-02', '2026-11-03']);
    expect(f.c).toEqual([32.6, 32.5]);
  });
});
