import { describe, expect, it } from 'vitest';
import type { Candle } from '../data/types';
import { evaluateEventCall, evaluatePriceCall } from './evaluate';
import { dayText, progressText, ruleText } from './format';
import type { EventCall, PriceCall } from './types';

const bars = (...rows: [string, number, number, number][]): Candle[] =>
  rows.map(([time, high, low, close]) => ({ time, open: close, high, low, close, volume: 1 }));

const PUBLISHED = '2026-11-06T15:05:37.000Z';
const sweep: PriceCall = { id: 's', kind: 'price', asset: 'BTC', text: '', direction: 'down', target: 74900, by: '2026-11-20', basis: '' };
const drop: PriceCall = { ...sweep, id: 'd', trigger: 74900, target: 67410, by: '2026-12-31' };

describe('預測的判斷方式和進度（白話）', () => {
  it('判斷方式', () => {
    expect(ruleText(sweep)).toBe('期限內任何一天的最低價跌到 74,900 美元以下，就算說對。');
    expect(ruleText(drop)).toBe(
      '要先跌破 74,900 美元；之後在期限內最低價跌到 67,410 美元以下，就算說對。到期都沒有跌破 74,900 美元，就是「條件沒發生」，不算對也不算錯。',
    );
  });

  it('還在等：寫出最新收盤離條件價位多遠；上傳後還沒有資料也說清楚', () => {
    const r = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-05', 80833, 75114, 75942]));
    expect(progressText(drop, r, 2026)).toBe(
      '11/5（四）收盤 75,942 美元，離條件價位 74,900 美元還要再跌 1.4%。影片上傳之後還沒有新的收盤資料。',
    );
  });

  it('條件成立之後改寫離目標多遠', () => {
    const r = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 76000, 74000, 74500]));
    expect(progressText(drop, r, 2026)).toBe(
      '11/7（六）已經跌破 74,900 美元（條件成立），現在等它跌到 67,410 美元。11/7（六）收盤 74,500 美元，離目標 67,410 美元還要再跌 9.5%。影片上傳後最低價跌到 74,000 美元（11/7）。',
    );
  });

  it('上傳當天已經在目標以下：說明那一根還不算', () => {
    const r = evaluatePriceCall(sweep, PUBLISHED, bars(['2026-11-06', 77000, 74000, 74500]));
    expect(progressText(sweep, r, 2026)).toContain('影片上傳當天和之前的 K 棒不算');
  });

  it('有結果之後', () => {
    const hit = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 77000, 74500, 75000], ['2026-11-20', 74000, 67000, 68000]));
    expect(progressText(drop, hit, 2026)).toBe('11/7（六）跌破 74,900 美元，11/20（五）跌到 67,410 美元以下，說對了。');
    const voided = evaluatePriceCall(drop, PUBLISHED, bars(['2026-11-07', 80000, 76000, 79000], ['2026-12-31', 90000, 80000, 88000]));
    expect(progressText(drop, voided, 2026)).toBe('到期前最低價只跌到 76,000 美元（11/7），沒有跌破 74,900 美元，條件沒發生。');
    const missed = evaluatePriceCall(sweep, PUBLISHED, bars(['2026-11-07', 77000, 75500, 76500], ['2026-11-20', 80000, 76000, 79000]));
    expect(progressText(sweep, missed, 2026)).toBe('到期前最低價只跌到 75,500 美元（11/7），沒有跌到 74,900 美元。');
  });

  it('事件預測', () => {
    const fed: EventCall = { id: 'f', kind: 'event', text: '', by: '2026-12-10', basis: '' };
    expect(progressText(fed, evaluateEventCall(fed, '2026-11-07'), 2026)).toBe('12/10（四）之後確認。');
    expect(progressText(fed, evaluateEventCall(fed, '2026-12-11'), 2026)).toBe('已經過了期限，等主持人確認實際的結果。');
  });

  it('不是今年的日期加上年份', () => {
    expect(dayText('2027-01-15', 2026)).toBe('2027/1/15（五）');
  });
});
