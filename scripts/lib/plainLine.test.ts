import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Candle } from '../../src/data/types';
import { describeOf, getIndicator } from '../../src/indicators/registry';

function load(sym: string): Candle[] {
  const b = JSON.parse(readFileSync(`public/data/${sym}.json`, 'utf8')).bars;
  return b.t.map((t: string, i: number) => ({ time: t, open: b.o[i], high: b.h[i], low: b.l[i], close: b.c[i], volume: b.v[i] }));
}

/** 第一行不能出現的術語和數字代號 */
const JARGON = /DIF|MACD|OSC|%B|\+DI|−DI|ADX|先行帶|S1|S2|R1|R2|RSV|SAR|%K|%D|ATR|CCI|ROC|BIAS|PSY|OBV|MFI|=/;
const IDS = ['macd', 'bollinger', 'keltner', 'dmi', 'ichimoku', 'pivot', 'kd', 'rsi', 'mfi', 'stoch-rsi', 'williams-r', 'cci', 'roc', 'atr', 'donchian', 'psar', 'supertrend', 'obv', 'psy', 'bias'];

describe('指標卡第一行的白話', () => {
  for (const sym of ['0050', 'VOO', 'BTC']) {
    const candles = load(sym);
    it(`${sym}：每個指標都有白話，而且不含術語`, () => {
      for (const id of IDS) {
        const def = getIndicator(id)!;
        const d = describeOf({ def, params: def.defaults, result: def.compute(candles, def.defaults, {}) }, candles);
        expect(d, id).toBeTruthy();
        expect(d!.plain, id).toBeTruthy();
        expect(d!.plain!, `${id}：${d!.plain}`).not.toMatch(JARGON);
        expect(d!.plain!.length, id).toBeLessThanOrEqual(40);
      }
    });
  }

  it('MACD 的白話：空方、柱狀體縮小 → 跌勢變慢', () => {
    const candles = load('0050');
    const def = getIndicator('macd')!;
    const r = def.compute(candles, def.defaults, {});
    const n = candles.length;
    const v = (k: string) => r.lines.find((l) => l.key === k)!.values;
    const d = describeOf({ def, params: def.defaults, result: r }, candles)!;
    const dif = v('dif')[n - 1]!;
    const sig = v('macd')[n - 1]!;
    const faster = Math.abs(v('osc')[n - 1]!) > Math.abs(v('osc')[n - 2]!);
    if (dif < sig && dif < 0) expect(d.plain).toBe(faster ? '短期在跌，而且跌勢變快' : '短期在跌，但跌勢變慢');
  });
});
