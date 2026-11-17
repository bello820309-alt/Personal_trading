import { describe, expect, it } from 'vitest';
import { afterStats, afterText, longestRun } from './after';

/* 「過去出現這種情況之後怎麼走」：一定是從資料數出來的，而且要和所有日子比 */

describe('條件成立之後的統計', () => {
  // 20 根：前 10 根每根漲 1，後 10 根每根跌 1
  const candles = [...Array.from({ length: 10 }, (_, i) => 100 + i), ...Array.from({ length: 10 }, (_, i) => 110 - i)].map((close) => ({ close }));

  it('數出符合條件的天數、之後上漲的天數，以及所有日子的基準', () => {
    // 條件：前 5 根；之後看 2 根
    const st = afterStats(candles, (i) => i < 5, 2);
    expect(st).toEqual({ bars: 2, total: 5, up: 5, allTotal: 18, allUp: 9 });
  });

  it('不到 10 天就說太少，不寫比例', () => {
    const st = afterStats(candles, (i) => i < 5, 2);
    const text = afterText(st, '某個條件成立', 'up');
    expect(text).toContain('只有 5 天，太少');
    expect(text).not.toContain('%');
  });

  it('寫出比例，並同時寫出所有日子的比例', () => {
    const long = Array.from({ length: 100 }, (_, i) => ({ close: 100 + (i % 4 === 0 ? 5 : 0) + i * 0.01 }));
    const st = afterStats(long, (i) => i % 4 === 0, 1);
    const text = afterText(st, '某個條件成立', 'down');
    // 每 4 天有一天特別高，隔天一定比較低
    expect(text).toContain(`有 ${st.total} 天，其中 ${st.total} 天（100%）在 1 根 K 棒之後價格比較低`);
    expect(text).toMatch(/所有日子是 \d+%/);
    expect(text).toContain('不保證這次一樣');
  });

  it('連續符合條件最久的一次', () => {
    expect(longestRun(10, (i) => i === 1 || (i >= 4 && i <= 6))).toBe(3);
    expect(longestRun(5, () => false)).toBe(0);
  });
});
