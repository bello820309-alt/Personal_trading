import { describe, expect, it } from 'vitest';
import { EVENTS, RATE_CHANGES, UPCOMING_FOMC, eventsFor, fedUpperAt, regimeAt } from './events';
import { isIsoDate } from './range';

describe('消息面事件清單', () => {
  it('日期格式正確，而且依日期排序', () => {
    for (const e of EVENTS) expect(isIsoDate(e.date), e.date).toBe(true);
    const dates = EVENTS.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    for (const d of UPCOMING_FOMC) expect(isIsoDate(d)).toBe(true);
  });

  it('FOMC 每年 8 次例會；2020 年另有 2 次緊急降息（其中 3 月的例會被緊急會議取代）', () => {
    const count = (y: number) => EVENTS.filter((e) => e.rate && e.date.startsWith(String(y))).length;
    for (const y of [2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025]) expect(count(y), String(y)).toBe(8);
    expect(count(2020)).toBe(9);
    expect(EVENTS.filter((e) => e.rate?.emergency).map((e) => e.date)).toEqual(['2020-03-03', '2020-03-15']);
  });

  it('利率路徑和聯準會公布的區間上限一致', () => {
    const checks: [string, number][] = [
      ['2015-12-15', 0.25], // 2008 年 12 月起的 0～0.25%
      ['2015-12-16', 0.5], // 金融海嘯後第一次升息
      ['2018-12-19', 2.5],
      ['2019-10-30', 1.75],
      ['2020-03-15', 0.25], // 疫情緊急降到零
      ['2022-12-14', 4.5],
      ['2023-07-26', 5.5], // 這一輪的最高點
      ['2024-09-18', 5.0], // 一次降 2 碼
      ['2024-12-18', 4.5],
      ['2025-12-10', 3.75],
      ['2026-09-16', 4.0], // 2023 年以來第一次升息
      ['2026-11-03', 4.0],
    ];
    for (const [d, upper] of checks) expect(fedUpperAt(d), d).toBeCloseTo(upper, 10);
    expect(RATE_CHANGES.filter((e) => e.date.startsWith('2022')).map((e) => e.rate!.change)).toEqual([0.25, 0.5, 0.75, 0.75, 0.75, 0.75, 0.5]);
  });

  it('利率環境：看最近一次調整的方向，超過一年沒調整就是「利率不變期」', () => {
    expect(regimeAt('2015-06-01')).toBe('steady');
    expect(regimeAt('2016-01-15')).toBe('hiking');
    expect(regimeAt('2019-12-01')).toBe('cutting');
    expect(regimeAt('2021-06-01')).toBe('steady');
    expect(regimeAt('2022-06-01')).toBe('hiking');
    expect(regimeAt('2024-08-01')).toBe('steady');
    expect(regimeAt('2024-10-01')).toBe('cutting');
    expect(regimeAt('2026-10-01')).toBe('hiking');
  });

  it('比特幣專屬的事件不會出現在股票的清單裡', () => {
    expect(eventsFor('0050').some((e) => e.group === 'halving' || e.group === 'crypto')).toBe(false);
    expect(eventsFor('BTC').filter((e) => e.group === 'halving').map((e) => e.date)).toEqual(['2016-07-09', '2020-05-11', '2024-04-20']);
    expect(eventsFor('VOO').some((e) => e.group === 'election')).toBe(true);
  });
});
