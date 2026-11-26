import { describe, expect, it } from 'vitest';
import { getIndicator } from '../indicators/registry';
import { BASICS } from './basics';
import { nextRouteDay, parseRouteProgress, ROUTE_DAYS } from './route';

describe('7 天新手路線', () => {
  it('剛好 7 天，每天都有任務和至少一個連結', () => {
    expect(ROUTE_DAYS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const d of ROUTE_DAYS) {
      expect(d.task.length).toBeGreaterThan(10);
      expect(d.links.length).toBeGreaterThan(0);
    }
  });

  it('連結都指到存在的頁面', () => {
    const basics = new Set(BASICS.map((b) => b.id));
    const pages = ['/', '/chart', '/backtest', '/backtest/rank', '/backtest/dca', '/backtest/events', '/forecast', '/analysts', '/lab'];
    for (const l of ROUTE_DAYS.flatMap((d) => d.links)) {
      const path = l.to.split('?')[0]!;
      if (path.startsWith('/basics/')) expect(basics.has(path.slice(8)), l.to).toBe(true);
      else if (path.startsWith('/learn/')) expect(getIndicator(path.slice(7)), l.to).toBeTruthy();
      else if (path.startsWith('/chart/')) expect(['0050', 'VOO', 'BTC']).toContain(path.slice(7));
      else expect(pages, l.to).toContain(path);
    }
  });

  it('導覽列的 8 個地方都有介紹到', () => {
    const text = JSON.stringify(BASICS.find((b) => b.id === 'getting-started'));
    for (const name of ['總覽', '圖表', '指標百科', '回測', '走勢預測', '分析師追蹤', 'AI 實驗', '設定與關於', '動態定投']) expect(text).toContain(name);
  });

  it('進度：讀取時略過壞掉的資料，下一天是第一個還沒完成的', () => {
    expect(parseRouteProgress(null)).toEqual([]);
    expect(parseRouteProgress('不是 JSON')).toEqual([]);
    expect(parseRouteProgress('[1, 3, 99, "2"]')).toEqual([1, 3]);
    expect(nextRouteDay([1, 3])).toBe(2);
    expect(nextRouteDay([1, 2, 3, 4, 5, 6, 7])).toBeNull();
  });
});
