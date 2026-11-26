import { describe, expect, it } from 'vitest';
import { stateView } from './stateView';

describe('指標卡的排法', () => {
  it('有白話時：第一行只放白話，原本的數字標題和結論放進展開區第一點', () => {
    const v = stateView({ tone: 'bearish', headline: 'DIF -4.20／MACD -3.99', detail: 'DIF 在訊號線之下。', plain: '短期在跌，但跌勢變慢', notes: [{ title: '背離', text: '沒有' }] });
    expect(v.first).toBe('短期在跌，但跌勢變慢');
    expect(v.detail).toBe('');
    expect(v.notes?.[0]).toEqual({ title: '數字和說明', text: 'DIF -4.20／MACD -3.99。DIF 在訊號線之下。' });
    expect(v.notes).toHaveLength(2);
  });

  it('沒有白話時照舊', () => {
    const d = { tone: 'neutral' as const, headline: '收盤價站上 1／3 條均線', detail: '說明' };
    expect(stateView(d)).toEqual({ first: d.headline, detail: '說明', notes: undefined });
  });
});
