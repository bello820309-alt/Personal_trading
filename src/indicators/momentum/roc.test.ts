import { describe, expect, it } from 'vitest';
import type { Candle } from '../../data/types';
import type { IndicatorResult } from '../types';
import { rocIndicator } from './roc';

const candles: Candle[] = [0, 1].map((i) => ({ time: `2026-11-0${i + 1}`, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
const res = (prev: number, v: number): IndicatorResult => ({ lines: [{ key: 'roc', label: 'ROC', values: [prev, v], kind: 'line', color: 's0' }] });
const detail = (prev: number, v: number) => rocIndicator.describe!(candles, res(prev, v), rocIndicator.defaults)!.detail;

describe('ROC 和昨天比：直接說漲幅、跌幅變大還是變小', () => {
  it('都在下跌：跌得更多 → 跌幅比昨天大；跌得少 → 跌幅比昨天小', () => {
    expect(detail(-6.87, -10.47)).toContain('昨天是 -6.87%，跌幅比昨天大');
    expect(detail(-10.47, -6.87)).toContain('跌幅比昨天小');
  });
  it('都在上漲；從跌翻成漲', () => {
    expect(detail(3, 5)).toContain('漲幅比昨天大');
    expect(detail(5, 3)).toContain('漲幅比昨天小');
    expect(detail(-2, 1)).toContain('今天從跌翻成漲');
  });
  it('不再用「強／弱」這種分不出方向的說法', () => {
    expect(detail(-6.87, -10.47)).not.toMatch(/比昨天(更強|弱一些)/);
  });
});
