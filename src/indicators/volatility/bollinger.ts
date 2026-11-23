import { fmtNum } from '../../data/format';
import { closes, crossOver, scanSignals, sma, stdev, validSlice, zip } from '../math/core';
import { afterStats, afterText, zoneNote } from '../math/after';
import { getLine, notesOf, type IndicatorDef, type Series } from '../types';
import { squeezeHistoryText, squeezeStatus, squeezeText } from './squeeze';

export type BollingerParams = { period: number; mult: number };

export const bollingerIndicator: IndicatorDef<BollingerParams> = {
  id: 'bollinger',
  shortName: 'BB',
  name: '布林通道',
  enName: 'Bollinger Bands',
  category: 'volatility',
  placement: 'overlay',
  params: [
    { key: 'period', type: 'number', label: '均線天數', min: 5, max: 100, step: 1 },
    { key: 'mult', type: 'number', label: '標準差倍數', min: 0.5, max: 4, step: 0.1 },
  ],
  defaults: { period: 20, mult: 2 },
  compute(candles, p) {
    const close = closes(candles);
    const mid = sma(close, p.period);
    const sd = stdev(close, p.period);
    const upper = zip(mid, sd, (m, s) => m + p.mult * s);
    const lower = zip(mid, sd, (m, s) => m - p.mult * s);
    const pctB: Series = close.map((c, i) => {
      const u = upper[i];
      const l = lower[i];
      if (c === null || u == null || l == null || u === l) return null;
      return (c - l) / (u - l);
    });
    const width: Series = mid.map((m, i) => {
      const u = upper[i];
      const l = lower[i];
      return m == null || u == null || l == null || m === 0 ? null : ((u - l) / m) * 100;
    });
    return {
      lines: [
        { key: 'upper', label: '上軌', values: upper, kind: 'line', color: 's1', width: 1 },
        { key: 'middle', label: `中軌（${p.period} 日均線）`, values: mid, kind: 'line', color: 's0', width: 1, dashed: true },
        { key: 'lower', label: '下軌', values: lower, kind: 'line', color: 's1', width: 1 },
        { key: 'pctB', label: '%B', values: pctB, kind: 'line', color: 'muted', hidden: true },
        { key: 'width', label: '帶寬 %', values: width, kind: 'line', color: 'muted', hidden: true, unit: 'percent' },
      ],
      fills: [{ upper: 'upper', lower: 'lower', color: 's1', opacity: 0.07 }],
    };
  },
  signals(candles, r) {
    const close = closes(candles);
    const lower = getLine(r, 'lower');
    const mid = getLine(r, 'middle');
    const below = (i: number) => {
      const l = lower[i];
      return l != null && (close[i] as number) < l;
    };
    return scanSignals(
      candles.length,
      (i) => below(i) && !below(i - 1),
      (i) => crossOver(close, mid, i),
      '跌破下軌',
      '回到中軌',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const b = getLine(r, 'pctB')[n - 1];
    const widthLine = getLine(r, 'width');
    const w = widthLine[n - 1];
    if (b == null || w == null) return null;
    const recent = validSlice(widthLine, n - 120, n);
    const maxW = recent.length >= 60 ? Math.max(...recent) : 0;
    const wide = maxW > 0 && w >= maxW * 0.8;
    // 擠壓：和肯特納通道的卡片用同一個判斷（兩種說法都寫出來）
    const st = squeezeStatus(candles);
    const sq = st ? squeezeText(st, candles[n - 1]!.close, squeezeHistoryText(candles)) : '';
    const widthNote = maxW > 0 ? `現在通道的寬度是最近半年最寬時的 ${fmtNum((w / maxW) * 10, 1)} 成（8 成以上算很寬）。` : '';
    const squeezed = !!st && (st.nearMin || st.inside);
    const sqHint = squeezed ? '另外，現在有「擠壓」的跡象（下面有說明）。' : '';
    const trendNote = (side: '上' | '下') => `在趨勢明顯的行情裡（例如 ADX 25 以上），價格可能沿著${side}軌一路走，碰到${side}軌不一定會${side === '上' ? '回檔' : '反彈'}。`;
    // 把「通道很寬」（寬度達到最近半年最寬的 8 成以上）的日子分開算：說明說這時碰到軌道比較不像反彈、回檔的訊號
    const wideAfter = (side: 'low' | 'high') => {
      const pb = getLine(r, 'pctB');
      const hit = (i: number) => {
        const x = pb[i];
        const wi = widthLine[i];
        if (x == null || wi == null || (side === 'low' ? x >= 0 : x <= 1)) return false;
        const past = validSlice(widthLine, i + 1 - 120, i + 1);
        return past.length >= 60 && wi >= Math.max(...past) * 0.8;
      };
      return afterText(afterStats(candles, hit, 10), `通道很寬（最近半年最寬的 8 成以上）時收盤在${side === 'low' ? '下軌之下' : '上軌之上'}`, side === 'low' ? 'up' : 'down');
    };
    const head = `%B = ${fmtNum(b, 2)}`;
    if (b > 1)
      return {
        tone: 'hot',
        headline: `${head}，突破上軌`,
        detail: wide
          ? '收盤價在上軌之上，而且通道接近半年來最寬：漲勢又急又大，價格可能沿著上軌繼續走，不一定是「漲太多該回檔」。'
          : `收盤價在上軌之上：走勢很強，但也偏離平均很多。${sqHint}`,
        notes: notesOf(['過去突破上軌之後', zoneNote(candles, getLine(r, 'pctB'), (x) => x > 1, '收盤在上軌之上', 'down')], ['通道很寬時突破上軌', wideAfter('high')], ['趨勢行情裡要注意', !wide && trendNote('上')], ['通道現在寬不寬', widthNote], ['有沒有「擠壓」', !wide && sq]),
      };
    if (b < 0)
      return {
        tone: 'cold',
        headline: `${head}，跌破下軌`,
        detail: wide
          ? '收盤價在下軌之下，而且通道接近半年來最寬：跌勢又急又大，價格可能沿著下軌繼續走，不是「跌太多該反彈」的訊號。'
          : `收盤價在下軌之下：跌勢很急，常被視為超跌。${sqHint}`,
        notes: notesOf(['過去跌破下軌之後', zoneNote(candles, getLine(r, 'pctB'), (x) => x < 0, '收盤在下軌之下', 'up')], ['通道很寬時跌破下軌', wideAfter('low')], ['趨勢行情裡要注意', !wide && trendNote('下')], ['通道現在寬不寬', widthNote], ['有沒有「擠壓」', !wide && sq]),
      };
    return {
      tone: b >= 0.5 ? 'bullish' : 'bearish',
      headline: `${head}，在中軌之${b >= 0.5 ? '上' : '下'}`,
      detail: `收盤價在通道的${b >= 0.5 ? '上' : '下'}半部（1 = 上軌、0 = 下軌）。${sqHint}`,
      notes: notesOf(['有沒有「擠壓」', sq], ['通道現在寬不寬', widthNote]),
    };
  },
  strategy: {
    name: '跌破下軌買、回到中軌賣（逆勢）',
    buyRule: '收盤價跌破布林通道下軌（偏離平均很多），隔天開盤買進。',
    sellRule: '收盤價回到中軌（20 日均線）之上，隔天開盤賣出。',
  },
};
