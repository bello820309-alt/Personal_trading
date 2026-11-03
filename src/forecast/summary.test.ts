import { describe, expect, it } from 'vitest';
import type { CheckResult, HorizonKey } from './analog';
import { bandNote, summarizeCheck } from './summary';

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

describe('bandNote', () => {
  it('列出每個時間長度，只要有一個太窄就提醒', () => {
    const note = bandNote([mk('1w', '1 週後', 0.5, 0.5, 0.7), mk('1m', '1 個月後', 0.5, 0.5, 0.65), mk('3m', '3 個月後', 0.5, 0.5, 0.59)]);
    expect(note).toContain('1 週 70%、1 個月 65%、3 個月 59%');
    expect(note).toContain('太窄');
  });

  it('接近 80% 時說明大致可信', () => {
    expect(bandNote([mk('1m', '1 個月後', 0.5, 0.5, 0.88), mk('3m', '3 個月後', 0.5, 0.5, 0.83)])).toContain('大致可信');
  });

  it('沒有結果時不顯示', () => {
    expect(bandNote([])).toBe('');
  });
});
