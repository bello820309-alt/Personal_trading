import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDateTime } from './format';

describe('時間一律用台北時間', () => {
  it('即時報價的更新時間：UTC 05:11 → 台北 13:11（不受裝置時區影響）', () => {
    expect(fmtClock(Date.UTC(2026, 10, 2, 5, 11))).toBe('11/02 13:11');
    // 台北已經是隔天的時候，日期也要跟著換
    expect(fmtClock(Date.UTC(2026, 10, 26, 16, 30))).toBe('11/27 00:30');
    expect(fmtClock(null)).toBe('—');
  });

  it('日期時間也是台北時間', () => {
    expect(fmtDateTime('2026-11-26T16:30:00Z')).toContain('2026/11/27');
    expect(fmtDateTime('2026-11-26T16:30:00Z')).toContain('00:30');
  });
});
