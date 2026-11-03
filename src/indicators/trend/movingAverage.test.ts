import { describe, expect, it } from 'vitest';
import { phaseText } from './movingAverage';

/* 價格在一部分均線之上、一部分之下時的白話說明（均線由短到長排列） */

const mas = (...v: number[]) => v.map((x, i) => ({ label: ['MA5', 'MA20', 'MA60', 'MA120', 'MA240'][i]!, v: x }));

describe('均線的白話說明：價格夾在均線中間時', () => {
  it('跌破所有短天期、還在最長的之上 → 長期上升趨勢裡的回檔（不是盤整）', () => {
    // 2026/11/03 的 0050：收 100.6，在 MA5～MA120 之下、MA240 之上
    const t = phaseText(100.6, mas(107.3, 106.5, 104.2, 101.9, 89.1));
    expect(t).toContain('長期上升趨勢裡的回檔');
    expect(t).toContain('再跌破 MA240');
    expect(t).not.toContain('整理');
  });

  it('站上所有短天期、還在長天期之下 → 長期下跌趨勢裡的反彈', () => {
    const t = phaseText(100, mas(98, 99, 101, 105, 110));
    expect(t).toContain('長期下跌趨勢裡的反彈');
    expect(t).toContain('再站上 MA60');
  });

  it('上上下下交錯 → 方向不明，才說整理或轉折', () => {
    expect(phaseText(100, mas(101, 99, 102, 98, 103))).toBe('長短期方向不一致，屬於整理或轉折階段。');
  });
});
