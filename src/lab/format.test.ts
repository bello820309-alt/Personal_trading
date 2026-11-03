import { describe, expect, it } from 'vitest';
import { fillText, orderText, pageLabel, priceText, twd, twdSigned, twdWan, unitsText } from './format';
import type { LabFill } from './types';

describe('AI 實驗的顯示文字', () => {
  it('金額、價格、數量', () => {
    expect(twd(1012345.4)).toBe('NT$1,012,345');
    expect(twd(-5000)).toBe('-NT$5,000');
    expect(twdSigned(2792)).toBe('+NT$2,792');
    expect(twdWan(1_012_345)).toBe('101.2 萬');
    expect(priceText('0050', 102.5)).toBe('NT$102.50');
    expect(priceText('BTC', 76677.3)).toBe('US$76,677');
    expect(unitsText('0050', 978)).toBe('978 股');
    expect(unitsText('VOO', 4.4888)).toBe('4.4888 股');
    expect(unitsText('BTC', 0.05686606)).toBe('0.05686606 顆');
  });

  it('下單與成交', () => {
    expect(orderText({ asset: '0050', side: 'buy', amount: 100000 })).toBe('買進 0050 NT$100,000');
    expect(orderText({ asset: 'BTC', side: 'sell', pct: 50 })).toBe('賣出 BTC 持有的 50%');
    const base = { orderId: 'x', asset: 'VOO', side: 'buy' as const, date: '2026-11-04', at: '2026-11-04T14:30:00.000Z', settledAt: '' };
    const filled: LabFill = { ...base, status: 'filled', price: 694, fx: 32.1, units: 4.4888, value: 99999.4, fee: 0, tax: 0, cash: -99999.4 };
    expect(fillText(filled)).toBe('以 US$694.00（匯率 32.1）成交 4.4888 股，花 NT$99,999');
    expect(fillText({ ...base, status: 'rejected', note: '現金不足' })).toBe('沒有成交：現金不足');
  });

  it('參加者看過的頁面換成好讀的名稱', () => {
    expect(pageLabel('/learn/rsi?asset=BTC')).toBe('指標百科：RSI（BTC）');
    expect(pageLabel('/chart/0050')).toBe('圖表：0050');
    expect(pageLabel('/forecast?asset=VOO&h=1w')).toBe('走勢預測（VOO）');
    expect(pageLabel('/backtest/rank?asset=BTC')).toBe('策略排行榜（BTC）');
    expect(pageLabel('/basics/getting-started')).toBe('第一次使用：從哪裡開始？');
    expect(pageLabel('/')).toBe('總覽');
    expect(pageLabel('/unknown')).toBe('/unknown');
  });
});
