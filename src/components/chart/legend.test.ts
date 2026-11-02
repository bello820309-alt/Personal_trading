import { describe, expect, it } from 'vitest';
import { getAsset } from '../../config/assets';
import type { LineOutput } from '../../indicators/types';
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
