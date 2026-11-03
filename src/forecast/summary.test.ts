import { describe, expect, it } from 'vitest';
import type { CheckResult, HorizonKey } from './analog';
import { checkPoints, summarizeCheck } from './summary';

const mk = (key: HorizonKey, label: string, hit: number, alwaysUp: number, coverage: number): CheckResult => ({
  horizon: { key, label, bars: 21 },
  tests: 200,
  hit,
  alwaysUp,
  coverage,
  from: '2021-01-01',
  to: '2026-01-01',
});

describe('summarizeCheck', () => {
  it('和「一直猜漲」比較，不誇大', () => {
    expect(summarizeCheck(mk('1m', '1 個月後', 0.62, 0.55, 0.8))[0]).toContain('有一點參考價值');
    expect(summarizeCheck(mk('1m', '1 個月後', 0.55, 0.56, 0.8))[0]).toContain('並沒有比較準');
    expect(summarizeCheck(mk('1m', '1 個月後', 0.46, 0.53, 0.8))[0]).toContain('反而比');
  });

  it('判斷八成範圍估得太窄、太寬或剛好', () => {
    expect(summarizeCheck(mk('1m', '1 個月後', 0.5, 0.5, 0.6))[1]).toContain('想得更寬');
    expect(summarizeCheck(mk('1m', '1 個月後', 0.5, 0.5, 0.95))[1]).toContain('偏寬');
    expect(summarizeCheck(mk('1m', '1 個月後', 0.5, 0.5, 0.82))[1]).toContain('接近理想');
  });
});

describe('checkPoints：預測數字旁邊的兩個重點', () => {
  it('猜漲跌和一直猜漲比較', () => {
    expect(checkPoints(mk('1m', '1 個月後', 0.62, 0.55, 0.8))[0]!.tone).toBe('good');
    expect(checkPoints(mk('1m', '1 個月後', 0.55, 0.56, 0.8))[0]!.tone).toBe('meh');
    const bad = checkPoints(mk('1m', '1 個月後', 0.46, 0.53, 0.8))[0]!;
    expect(bad.tone).toBe('bad');
    expect(bad.detail).toContain('猜對 46%');
    expect(bad.detail).toContain('53%');
  });

  it('範圍太窄、偏寬、剛好', () => {
    expect(checkPoints(mk('1m', '1 個月後', 0.5, 0.5, 0.6))[1]!.tone).toBe('bad');
    expect(checkPoints(mk('1m', '1 個月後', 0.5, 0.5, 0.95))[1]!.tone).toBe('meh');
    expect(checkPoints(mk('1m', '1 個月後', 0.5, 0.5, 0.88))[1]!.tone).toBe('good');
  });
});
