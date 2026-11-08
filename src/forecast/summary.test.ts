import { describe, expect, it } from 'vitest';
import { FEATURES, type CheckResult, type Forecast, type HorizonKey } from './analog';
import { checkPoints, describeNow, historyTail, similarityNote, summarizeCheck, usageTips } from './summary';

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

describe('usageTips：這些數字要怎麼用', () => {
  it('猜漲跌不準時，告訴新手不要把上漲比例當訊號', () => {
    const [a] = usageTips(mk('1m', '1 個月後', 0.55, 0.56, 0.8));
    expect(a).toContain('不要拿來當買賣訊號');
    expect(usageTips(mk('1m', '1 個月後', 0.62, 0.55, 0.8))[0]).toContain('有一點參考價值');
  });

  it('依照範圍準不準，說明八成範圍怎麼用', () => {
    expect(usageTips(mk('1m', '1 個月後', 0.5, 0.5, 0.8))[1]).toContain('我受得了嗎');
    expect(usageTips(mk('1m', '1 個月後', 0.5, 0.5, 0.95))[1]).toContain('保守的估計');
    expect(usageTips(mk('1m', '1 個月後', 0.5, 0.5, 0.6))[1]).toContain('預留比範圍更大的空間');
  });
});

describe('historyTail：過去 5 年最差的一成', () => {
  it('算出任何一天之後 N 根的漲跌，取最差的一成和最差的一次', () => {
    const times: string[] = [];
    const closes: number[] = [];
    for (let i = 0; i < 400; i++) {
      times.push(new Date(Date.UTC(2022, 0, 1) + i * 86400000).toISOString().slice(0, 10));
      closes.push(100 + (i % 10)); // 0→9 循環
    }
    const t = historyTail(closes, times, 5, 5)!;
    // 每 10 天一個循環（100→109 再回到 100）：之後 5 天最差的是從 105 跌回 100
    expect(t.min).toBeCloseTo(100 / 105 - 1, 6);
    expect(t.p10).toBeLessThan(0);
    expect(historyTail(closes.slice(0, 20), times.slice(0, 20), 5)).toBeNull();
  });

  it('範圍估得太窄時，把最差的一成寫進「所以怎麼用」', () => {
    const tip = usageTips(mk('1m', '1 個月後', 0.5, 0.5, 0.6), { p10: -0.12, min: -0.35, span: '1 個月' })[1]!;
    expect(tip).toContain('最差的一成是 -12.00% 以下');
    expect(tip).toContain('最差的一次是 -35.00%');
  });
});

/** 只填說明會用到的欄位 */
function fakeForecast(features: number[], analogFeatures: number[][], featureSd: number[]): Forecast {
  return { target: 0, analogs: [], paths: [], horizons: [], cone: [], features, analogFeatures, featureSd };
}

describe('「現在的狀態」的波動說明', () => {
  const asset = { name: '元大台灣50', tradesOnWeekends: false } as Parameters<typeof describeNow>[2];
  // 一年多的資料：每天交替漲跌 2%（波動固定），最後一根是目標
  const candles = Array.from({ length: 300 }, (_, i) => {
    const close = 100 * (i % 2 === 0 ? 1 : 1.02);
    return { time: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, open: close, high: close, low: close, close, volume: 1 };
  });
  const target = candles.length - 1;
  const at = (features: number[]) => ({ ...fakeForecast(features, [], []), target });

  it('一直寫出波動是怎麼算的，以及最近 1 個月、過去一年大約每天漲跌幾 %', () => {
    const t = describeNow(at([0.01, 0.01, 0.02, 0.03, 0.04, 0.05, 55, 1.0, -0.02]), candles, asset);
    expect(t).toContain('「波動」是每天漲跌幅的標準差');
    expect(t).toContain('最近 1 個月約 ±1.98%，過去一年約 ±1.98%');
    expect(t).not.toContain('方向一直');
  });

  it('一個月跌了兩成、波動卻和過去一年差不多：說明是跌的日子多，不是每天漲跌特別大', () => {
    // 2026/11/06 的 0050：近 1 個月 -20.22%，波動是過去一年的 0.86 倍
    const t = describeNow(at([-0.1186, -0.15, -0.2022, -0.1, -0.081, -0.02, 18.6, 0.86, -0.206]), candles, asset);
    expect(t).toContain('0.86 倍（和過去一年差不多）');
    expect(t).toContain('近 1 個月雖然跌了 20.2%，主要是下跌的日子比較多');
    expect(t).not.toContain('一點一點');
  });
});

describe('相似的日子到底像不像', () => {
  const sd = [0.03, 0.04, 0.059, 0.08, 0.1, 0.1, 10, 0.3, 0.07];

  it('現在和相似日子平均差超過 1 個標準差：提醒參考價值比較低', () => {
    const now = [-0.12, -0.15, -0.2022, -0.1, -0.08, -0.02, 18.6, 0.86, -0.206];
    const analogs = [[-0.06, -0.08, -0.0737, -0.09, -0.07, -0.02, 28, 0.6, -0.14]];
    const t = similarityNote(fakeForecast(now, analogs, sd), FEATURES);
    expect(t).toContain('「近 1 個月漲跌」現在是 -20.22%，相似日子的平均是 -7.37%');
  });

  it('差不多的時候不提醒', () => {
    const now = [-0.02, -0.03, -0.05, -0.04, -0.05, 0.01, 35, 1.4, -0.06];
    const analogs = [[-0.02, -0.03, -0.03, -0.04, -0.01, 0.01, 37, 1.1, -0.06]];
    expect(similarityNote(fakeForecast(now, analogs, sd), FEATURES)).toBeNull();
  });
});
