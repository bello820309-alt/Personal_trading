import { describe, expect, it } from 'vitest';
import { getAsset } from '../../config/assets';
import { INDICATORS } from '../../indicators/registry';
import type { Candle } from '../../data/types';
import type { LineOutput } from '../../indicators/types';
import { orderedLines } from './legend';
import { formatLegendValue, legendLabel } from './legend';

const line = (label: string, unit?: LineOutput['unit']): LineOutput => ({ key: 'x', label, values: [], kind: 'line', color: 's0', unit });

describe('圖例的精簡顯示', () => {
  it('短名稱：拿掉括號裡的補充說明', () => {
    expect(legendLabel(line('DIF（快線）'))).toBe('DIF');
    expect(legendLabel(line('上軌（20 日高點）'))).toBe('上軌');
    expect(legendLabel(line('MA20'))).toBe('MA20');
    expect(legendLabel(line('RSI(6)'))).toBe('RSI(6)');
  });

  it('成交量不重複寫單位；台股換算成「張」', () => {
    const btc = getAsset('BTC')!;
    const tw = getAsset('0050')!;
    expect(formatLegendValue(3_950_000_000, line('成交量', 'volume'), btc)).toBe('39.5億');
    expect(formatLegendValue(19_400_000, line('成交量', 'volume'), tw)).toBe('1.9萬');
    expect(formatLegendValue(null, line('成交量', 'volume'), btc)).toBe('—');
  });
});

describe('每個指標圖例上的線名稱都不一樣', () => {
  it('拿掉括號之後也不會有兩條線同名（不然看不出哪條是哪條）', () => {
    const candles: Candle[] = Array.from({ length: 300 }, (_, i) => {
      const close = 100 + 10 * Math.sin(i / 10) + i * 0.05;
      return { time: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), open: close, high: close + 1, low: close - 1, close, volume: 1000 + i };
    });
    for (const def of INDICATORS) {
      let r;
      try {
        r = def.compute(candles, def.defaults, {});
      } catch {
        continue; // 需要額外資料（例如比特幣鏈上資料）的指標
      }
      const labels = orderedLines(r).map(legendLabel);
      expect(new Set(labels).size, `${def.id}: ${labels.join('、')}`).toBe(labels.length);
    }
  });
});
