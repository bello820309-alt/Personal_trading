import { describe, expect, it } from 'vitest';
import type { Candle } from '../data/types';
import { distanceToTarget, evaluateEventCall, evaluatePriceCall, trackRecord, type EvaluatedCall } from './evaluate';
import type { EventCall, PriceCall } from './types';

/** 簡化的日 K：[日期, 最高, 最低, 收盤] */
const bars = (...rows: [string, number, number, number][]): Candle[] =>
  rows.map(([time, high, low, close]) => ({ time, open: close, high, low, close, volume: 1 }));

const sweep: PriceCall = {
  id: 't-sweep',
  kind: 'price',
  asset: 'BTC',
  text: '會跌破 74,900',
  direction: 'down',
  target: 74900,
  by: '2026-11-20',
  basis: '',
};

const drop: PriceCall = { ...sweep, id: 't-drop', trigger: 74900, target: 67410, by: '2026-12-31' };

// 影片在 2026-11-06 15:05（UTC）上傳：比特幣的日 K 是 UTC 日期，從 11/07 開始算
const PUBLISHED = '2026-11-06T15:05:37+00:00';

describe('價格預測：從上傳的隔天開始算', () => {
  it('上傳當天的最低價不算（有一部分是上傳之前的價格）', () => {
    const r = evaluatePriceCall(sweep, PUBLISHED, bars(['2026-11-06', 77000, 74000, 76000], ['2026-11-07', 77000, 75500, 76500]));
    expect(r.status).toBe('pending');
    expect(r.from).toBe('2026-11-06');
    expect(r.extreme).toEqual({ price: 75500, date: '2026-11-07' });
    expect(r.last).toEqual({ price: 76500, date: '2026-11-07' });
  });

  it('期限內最低價碰到目標就算說對，記下是哪一天', () => {
    const r = evaluatePriceCall(sweep, PUBLISHED, bars(['2026-11-07', 77000, 75500, 76500], ['2026-11-08', 76000, 74800, 75000]));
    expect(r.status).toBe('hit');
    expect(r.hitOn).toBe('2026-11-08');
  });

  it('資料到了期限那天還沒碰到就算說錯；還沒到期限就繼續等', () => {
    const before = evaluatePriceCall(sweep, PUBLISHED, bars(['2026-11-07', 77000, 75500, 76500], ['2026-11-19', 80000, 76000, 79000]));
    expect(before.status).toBe('pending');
    const after = evaluatePriceCall(sweep, PUBLISHED, bars(['2026-11-07', 77000, 75500, 76500], ['2026-11-20', 80000, 76000, 79000]));
    expect(after.status).toBe('miss');
  });

  it('期限之後才碰到不算', () => {
    const r = evaluatePriceCall(sweep, PUBLISHED, bars(['2026-11-07', 77000, 75500, 76500], ['2026-11-21', 76000, 70000, 71000]));
    expect(r.status).toBe('miss');
    expect(r.extreme).toEqual({ price: 75500, date: '2026-11-07' });
  });

  it('美股的日期用紐約時間：台灣晚上 11 點上傳，是紐約同一天早上，當天的 K 棒不算', () => {
    const voo: PriceCall = { ...sweep, asset: 'VOO', target: 600 };
    const r = evaluatePriceCall(voo, PUBLISHED, bars(['2026-11-06', 700, 590, 650], ['2026-11-09', 700, 640, 650]));
    expect(r.from).toBe('2026-11-06');
    expect(r.status).toBe('pending');
  });
});

describe('有條件的預測：先跌破 A 才會再跌到 B', () => {
  it('先碰到條件價位，之後再碰到目標 → 說對', () => {
    const r = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 77000, 74500, 75000], ['2026-11-20', 74000, 67000, 68000]));
    expect(r.status).toBe('hit');
    expect(r.triggeredOn).toBe('2026-11-07');
    expect(r.hitOn).toBe('2026-11-20');
  });

  it('同一天跌破條件價位又跌到目標 → 說對', () => {
    const r = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 77000, 67000, 68000]));
    expect(r.status).toBe('hit');
    expect(r.triggeredOn).toBe('2026-11-07');
    expect(r.hitOn).toBe('2026-11-07');
  });

  it('跌破了條件價位、到期還沒跌到目標 → 說錯', () => {
    const r = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 77000, 74500, 75000], ['2026-12-31', 80000, 70000, 79000]));
    expect(r.status).toBe('miss');
  });

  it('到期都沒跌破條件價位 → 條件沒發生（不算對也不算錯）', () => {
    const r = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 80000, 76000, 79000], ['2026-12-31', 90000, 80000, 88000]));
    expect(r.status).toBe('void');
    expect(trackRecord([{ result: r } as EvaluatedCall])).toEqual({ hit: 0, miss: 0, void: 1, pending: 0 });
  });

  it('還在等條件時，顯示離條件價位多遠；條件成立後改顯示離目標多遠', () => {
    const waiting = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 77000, 75500, 76000]));
    expect(distanceToTarget(drop, waiting)).toMatchObject({ level: 74900, label: '條件價位' });
    expect(distanceToTarget(drop, waiting)!.pct).toBeCloseTo(74900 / 76000 - 1, 10);
    const triggered = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 77000, 74000, 74500]));
    expect(distanceToTarget(drop, triggered)).toMatchObject({ level: 67410, label: '目標' });
  });
});

describe('事件預測（人工標記）', () => {
  const fed: EventCall = { id: 't-fed', kind: 'event', text: '12 月會升息', by: '2026-12-10', basis: '' };

  it('還沒標記：期限前是等待，過了期限提醒還沒確認', () => {
    expect(evaluateEventCall(fed, '2026-12-10')).toEqual({ status: 'pending', from: '' });
    expect(evaluateEventCall(fed, '2026-12-11')).toMatchObject({ status: 'pending', overdue: true });
  });

  it('標記之後照標記的結果', () => {
    expect(evaluateEventCall({ ...fed, result: 'hit' }, '2026-12-11').status).toBe('hit');
  });
});
