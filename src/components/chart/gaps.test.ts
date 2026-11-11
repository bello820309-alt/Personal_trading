import { describe, expect, it } from 'vitest';
import { breakLineGaps, GAP_COLOR } from './gaps';

/* 線中間沒有值的地方要斷開：把空白前最後一點設成透明（連接線的顏色跟著起點） */

describe('線圖的空白要斷開', () => {
  it('空白前的最後一點變透明，其他點不動', () => {
    const pts = [
      { time: 1, value: 10 },
      { time: 2, value: 11 },
      { time: 3 },
      { time: 4 },
      { time: 5, value: 5, color: '#f00' },
      { time: 6, value: 6 },
    ];
    const out = breakLineGaps(pts);
    expect(out[0]).toEqual({ time: 1, value: 10 });
    expect(out[1]).toEqual({ time: 2, value: 11, color: GAP_COLOR });
    expect(out[4]).toEqual({ time: 5, value: 5, color: '#f00' });
    expect(pts[1]).toEqual({ time: 2, value: 11 });
  });

  it('開頭或結尾的空白不用處理；沒有空白就完全不變', () => {
    expect(breakLineGaps([{ time: 1 }, { time: 2, value: 1 }, { time: 3, value: 2 }, { time: 4 }])).toEqual([
      { time: 1 },
      { time: 2, value: 1 },
      { time: 3, value: 2 },
      { time: 4 },
    ]);
  });
});
