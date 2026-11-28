import { describe, expect, it } from 'vitest';
import { regimeSummary, type RegimeItem } from './regime';

const t = (name: string, tone: RegimeItem['tone']): RegimeItem => ({ name, category: 'trend', tone });
const o = (name: string, tone: RegimeItem['tone']): RegimeItem => ({ name, category: 'momentum', tone });

describe('總覽的綜合判斷', () => {
  const trend = [t('MA', 'bearish'), t('MACD', 'bearish'), t('DMI', 'bearish'), t('SAR', 'bullish'), t('SuperTrend', 'bearish'), t('雲', 'bearish')];

  it('ADX 25 以上：趨勢盤，統計趨勢指標，點名和趨勢方向相反的擺盪指標', () => {
    const s = regimeSummary([...trend, o('KD', 'bullish'), o('RSI', 'cold'), o('CCI', 'hot'), o('W%R', 'neutral')], 37.4)!;
    expect(s).toBe(
      'ADX 37.4 → 趨勢盤，以趨勢指標為主：5/6 個趨勢指標偏空（偏空：MA、MACD、DMI、SuperTrend、雲；偏多：SAR）。KD 偏多、RSI 過冷和趨勢方向不一致，在趨勢盤中要打折看。',
    );
  });

  it('趨勢偏多時，擺盪的「過冷」算一致（上升趨勢裡的回檔）', () => {
    const up = trend.map((x) => ({ ...x, tone: 'bullish' as const }));
    const s = regimeSummary([...up, o('RSI', 'cold'), o('KD', 'hot')], 30)!;
    expect(s).toContain('6/6 個趨勢指標偏多');
    expect(s).toContain('KD 過熱和趨勢方向不一致');
    expect(s).not.toContain('RSI 過冷');
  });

  it('ADX 20 以下：盤整，以擺盪指標為主', () => {
    const s = regimeSummary([...trend, o('KD', 'cold'), o('RSI', 'cold'), o('CCI', 'bearish')], 16.2)!;
    expect(s).toMatch(/^ADX 16.2 → 盤整，以擺盪指標為主：擺盪指標 3 個裡2 個過冷、1 個偏空/);
    expect(s).toContain('在盤整時要打折看');
  });

  it('ADX 20～25：兩類都打折，意見不一致就先觀望', () => {
    const s = regimeSummary([...trend, o('KD', 'bullish'), o('RSI', 'cold')], 22)!;
    expect(s).toContain('趨勢正在形成或變弱');
    expect(s).toContain('先觀望');
  });

  it('沒有 ADX 或沒有趨勢指標就不寫', () => {
    expect(regimeSummary(trend, null)).toBeNull();
    expect(regimeSummary([o('KD', 'bullish')], 30)).toBeNull();
  });
});
