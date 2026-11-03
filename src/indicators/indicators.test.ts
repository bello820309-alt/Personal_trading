import { describe, expect, it } from 'vitest';
import * as ti from 'technicalindicators';
import type { Candle } from '../data/types';
import { syntheticCandles, syntheticExtra } from './testUtils';
import { INDICATORS, computeIndicator, describeOf, getIndicator, signalsOf } from './registry';
import { atrWilder, ema, highest, lowest, sma, stdev } from './math/core';
import { rsiSeries } from './momentum/rsi';
import { kdSeries } from './momentum/kd';
import { trailingQuantile } from './momentum/bias';
import { stochOf } from './momentum/stochRsi';
import { fibLevels } from './levels/fibonacci';
import { resolveParams, getLine, type Series } from './types';
import { maDisplayPeriods } from './trend/movingAverage';

const candles = syntheticCandles(800);
const close = candles.map((c) => c.close);
const high = candles.map((c) => c.high);
const low = candles.map((c) => c.low);
const volume = candles.map((c) => c.volume);

/** 比較「我們的數列」最後 tail 個值與對照組（對照組通常沒有暖身期，所以從尾端對齊） */
function expectTail(mine: Series, oracle: number[], tail: number, tol: number, relative = false) {
  expect(oracle.length).toBeGreaterThanOrEqual(tail);
  const m = mine.slice(-tail);
  const o = oracle.slice(-tail);
  for (let i = 0; i < tail; i++) {
    const a = m[i];
    const b = o[i]!;
    expect(a, `index ${i}`).not.toBeNull();
    const diff = Math.abs((a as number) - b);
    const limit = relative ? tol * Math.max(1, Math.abs(b)) : tol;
    expect(diff, `index ${i}: ${a} vs ${b}`).toBeLessThanOrEqual(limit);
  }
}

describe('基礎數學（與 technicalindicators 對照）', () => {
  it('SMA', () => {
    const o = ti.SMA.calculate({ period: 20, values: close });
    expectTail(sma(close, 20), o, o.length, 1e-9, true);
    expect(sma(close, 20).slice(0, 19).every((v) => v === null)).toBe(true);
  });

  it('EMA（起始值為 SMA）', () => {
    const o = ti.EMA.calculate({ period: 12, values: close });
    expectTail(ema(close, 12), o, o.length, 1e-9, true);
  });

  it('RSI（Wilder 平滑）', () => {
    const o = ti.RSI.calculate({ period: 14, values: close });
    // technicalindicators 的 RSI 會四捨五入到小數 2 位
    expectTail(rsiSeries(close, 14), o, o.length, 0.006);
  });

  it('MACD', () => {
    const o = ti.MACD.calculate({
      values: close,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const r = computeIndicator(getIndicator('macd')!, candles, 'us').result;
    const tail = 600;
    expectTail(getLine(r, 'dif'), o.map((x) => x.MACD as number), tail, 1e-9, true);
    expectTail(getLine(r, 'macd'), o.map((x) => x.signal as number), tail, 1e-9, true);
    expectTail(getLine(r, 'osc'), o.map((x) => x.histogram as number), tail, 1e-9, true);
  });

  it('布林通道（母體標準差）', () => {
    const o = ti.BollingerBands.calculate({ period: 20, stdDev: 2, values: close });
    const r = computeIndicator(getIndicator('bollinger')!, candles, 'us').result;
    expectTail(getLine(r, 'upper'), o.map((x) => x.upper), o.length, 1e-9, true);
    expectTail(getLine(r, 'middle'), o.map((x) => x.middle), o.length, 1e-9, true);
    expectTail(getLine(r, 'lower'), o.map((x) => x.lower), o.length, 1e-9, true);
    expectTail(stdev(close, 20), o.map((x) => (x.upper - x.middle) / 2), o.length, 1e-9, true);
  });

  it('ATR（Wilder）', () => {
    const o = ti.ATR.calculate({ high, low, close, period: 14 });
    expectTail(atrWilder(candles, 14), o, 500, 1e-6, true);
  });

  it('DMI／ADX', () => {
    const o = ti.ADX.calculate({ high, low, close, period: 14 });
    const r = computeIndicator(getIndicator('dmi')!, candles, 'us').result;
    expectTail(getLine(r, 'adx'), o.map((x) => x.adx), 400, 1e-3);
    expectTail(getLine(r, 'pdi'), o.map((x) => x.pdi), 400, 1e-3);
    expectTail(getLine(r, 'mdi'), o.map((x) => x.mdi), 400, 1e-3);
  });

  it('CCI', () => {
    const o = ti.CCI.calculate({ high, low, close, period: 20 });
    const r = computeIndicator(getIndicator('cci')!, candles, 'us').result;
    expectTail(getLine(r, 'cci'), o, o.length, 1e-6, true);
  });

  it('威廉指標 %R', () => {
    const o = ti.WilliamsR.calculate({ high, low, close, period: 14 });
    const r = computeIndicator(getIndicator('williams-r')!, candles, 'us').result;
    expectTail(getLine(r, 'wr'), o, o.length, 1e-6);
  });

  it('OBV（比較每天的變化量，起點不同不影響）', () => {
    const o = ti.OBV.calculate({ close, volume });
    const r = computeIndicator(getIndicator('obv')!, candles, 'us').result;
    const mine = getLine(r, 'obv') as number[];
    const dm = mine.slice(-500).map((v, i, a) => (i === 0 ? 0 : v - a[i - 1]!));
    const doo = o.slice(-500).map((v, i, a) => (i === 0 ? 0 : v - a[i - 1]!));
    expect(dm).toEqual(doo);
  });

  it('MFI', () => {
    const o = ti.MFI.calculate({ high, low, close, volume, period: 14 });
    const r = computeIndicator(getIndicator('mfi')!, candles, 'us').result;
    expectTail(getLine(r, 'mfi'), o, o.length, 0.006);
  });

  it('ROC', () => {
    const o = ti.ROC.calculate({ period: 12, values: close });
    const r = computeIndicator(getIndicator('roc')!, candles, 'us').result;
    expectTail(getLine(r, 'roc'), o, o.length, 1e-9, true);
  });

  it('Stochastic RSI（用對照組的 RSI 當輸入，驗證隨機化與平滑公式）', () => {
    // technicalindicators 內部的 RSI 會四捨五入到小數 2 位，所以把它的 RSI 餵給我們的公式來比較
    const rsiTi = ti.RSI.calculate({ period: 14, values: close });
    const o = ti.StochasticRSI.calculate({ values: close, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 });
    const k = sma(stochOf(rsiTi, 14), 3);
    const d = sma(k, 3);
    expectTail(k, o.map((x) => x.k), 500, 1e-6);
    expectTail(d, o.map((x) => x.d), 500, 1e-6);
    // 我們自己的完整版本與對照組差距很小（只差在四捨五入）
    const r = computeIndicator(getIndicator('stoch-rsi')!, candles, 'us').result;
    const diffs = getLine(r, 'k')
      .slice(-500)
      .map((v, i) => Math.abs((v as number) - o.slice(-500)[i]!.k));
    expect(diffs.reduce((a, b) => a + b, 0) / diffs.length).toBeLessThan(0.05);
  });
});

/** 手工 K 棒：用簡單的數字，方便用紙筆驗算 */
function hand(rows: [number, number, number][]): Candle[] {
  return rows.map(([h, l, c], i) => ({
    time: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: c,
    high: h,
    low: l,
    close: c,
    volume: 1000,
  }));
}

describe('台灣 KD（手算驗證）', () => {
  // 12 根 K 棒：前 9 根最高 20、最低 10
  const rows: [number, number, number][] = [
    [12, 10, 11],
    [14, 11, 13],
    [15, 12, 14],
    [16, 13, 15],
    [18, 14, 17],
    [20, 16, 19],
    [19, 15, 16],
    [17, 13, 14],
    [16, 12, 15],
    [22, 15, 21],
    [21, 18, 20],
    [19, 14, 15],
  ];
  const c = hand(rows);

  it('第 9 根（index 8）：RSV、K、D 依公式從 50 起算', () => {
    const { rsv, k, d } = kdSeries(c, 9, 3, 3);
    expect(rsv.slice(0, 8).every((v) => v === null)).toBe(true);
    // 最近 9 日最高 20、最低 10、收盤 15 → RSV = (15 − 10) ÷ (20 − 10) × 100 = 50
    expect(rsv[8]).toBeCloseTo(50, 10);
    // K = 50 × 2/3 + 50 × 1/3 = 50；D = 50 × 2/3 + 50 × 1/3 = 50
    expect(k[8]).toBeCloseTo(50, 10);
    expect(d[8]).toBeCloseTo(50, 10);
  });

  it('第 10 根（index 9）', () => {
    const { rsv, k, d } = kdSeries(c, 9, 3, 3);
    // 最近 9 日（index 1～9）最高 22、最低 11、收盤 21 → RSV = (21 − 11) ÷ 11 × 100
    const rsv9 = ((21 - 11) / (22 - 11)) * 100;
    expect(rsv[9]).toBeCloseTo(rsv9, 10);
    const k9 = (50 * 2) / 3 + rsv9 / 3;
    expect(k[9]).toBeCloseTo(k9, 10);
    expect(d[9]).toBeCloseTo((50 * 2) / 3 + k9 / 3, 10);
  });

  it('第 12 根（index 11）', () => {
    const { rsv, k, d } = kdSeries(c, 9, 3, 3);
    const rsv9 = ((21 - 11) / (22 - 11)) * 100;
    const rsv10 = ((20 - 12) / (22 - 12)) * 100; // index 2～10：最高 22、最低 12
    const rsv11 = ((15 - 12) / (22 - 12)) * 100; // index 3～11：最高 22、最低 12
    expect(rsv[10]).toBeCloseTo(rsv10, 10);
    expect(rsv[11]).toBeCloseTo(rsv11, 10);
    let kk = 50;
    let dd = 50;
    for (const r of [50, rsv9, rsv10, rsv11]) {
      kk = (kk * 2) / 3 + r / 3;
      dd = (dd * 2) / 3 + kk / 3;
    }
    expect(k[11]).toBeCloseTo(kk, 10);
    expect(d[11]).toBeCloseTo(dd, 10);
  });
});

describe('其他指標（手算或性質驗證）', () => {
  it('乖離率 = (收盤 − 均線) ÷ 均線 × 100', () => {
    const c = hand([10, 11, 12, 13, 14].map((x) => [x, x, x] as [number, number, number]));
    const r = computeIndicator(getIndicator('bias')!, c, 'tw', { periods: [3], lookback: 60, percentile: 5 }).result;
    const b = getLine(r, 'bias');
    expect(b[1]).toBeNull();
    // index 2：均線 (10+11+12)/3 = 11 → (12 − 11) ÷ 11 × 100
    expect(b[2]).toBeCloseTo((1 / 11) * 100, 10);
    expect(b[4]).toBeCloseTo(((14 - 13) / 13) * 100, 10);
  });

  it('心理線 = 最近 N 天上漲天數 ÷ N × 100', () => {
    const closes = [10, 11, 10, 12, 13, 13, 12, 14];
    const c = hand(closes.map((x) => [x, x, x] as [number, number, number]));
    const r = computeIndicator(getIndicator('psy')!, c, 'tw', { period: 4, overbought: 75, oversold: 25 }).result;
    const p = getLine(r, 'psy');
    expect(p[3]).toBeNull();
    // index 1～4 的漲跌：漲、跌、漲、漲 → 3/4
    expect(p[4]).toBeCloseTo(75, 10);
    // index 4～7：漲、平、跌、漲 → 2/4
    expect(p[7]).toBeCloseTo(50, 10);
  });

  it('一目均衡表轉換線 = (9 日最高 + 9 日最低) ÷ 2', () => {
    const r = computeIndicator(getIndicator('ichimoku')!, candles, 'us').result;
    const t = getLine(r, 'tenkan');
    const i = 300;
    const hh = Math.max(...high.slice(i - 8, i + 1));
    const ll = Math.min(...low.slice(i - 8, i + 1));
    expect(t[i]).toBeCloseTo((hh + ll) / 2, 10);
    expect(t[7]).toBeNull();
  });

  it('唐奇安通道上下軌 = N 日最高／最低', () => {
    const r = computeIndicator(getIndicator('donchian')!, candles, 'us').result;
    expect(getLine(r, 'upper')).toEqual(highest(high, 20));
    expect(getLine(r, 'lower')).toEqual(lowest(low, 20));
  });

  it('SAR：多方時在 K 棒下方，空方時在 K 棒上方', () => {
    const r = computeIndicator(getIndicator('psar')!, candles, 'us').result;
    const sar = getLine(r, 'sar');
    const trend = getLine(r, 'trend');
    for (let i = 2; i < candles.length; i++) {
      if (trend[i] === 1) expect(sar[i]!).toBeLessThanOrEqual(candles[i]!.low + 1e-9);
      if (trend[i] === -1) expect(sar[i]!).toBeGreaterThanOrEqual(candles[i]!.high - 1e-9);
    }
    expect(trend.filter((t) => t === 1).length).toBeGreaterThan(50);
    expect(trend.filter((t) => t === -1).length).toBeGreaterThan(50);
  });

  it('SuperTrend：多方線在收盤價下方，空方線在收盤價上方', () => {
    const r = computeIndicator(getIndicator('supertrend')!, candles, 'us').result;
    const up = getLine(r, 'up');
    const down = getLine(r, 'down');
    for (let i = 0; i < candles.length; i++) {
      if (up[i] != null) expect(up[i]!).toBeLessThan(candles[i]!.close);
      if (down[i] != null) expect(down[i]!).toBeGreaterThan(candles[i]!.close);
      expect(up[i] != null && down[i] != null).toBe(false);
    }
  });

  it('樞軸點：用上個月的高低收計算', () => {
    const r = computeIndicator(getIndicator('pivot')!, candles, 'us', { basis: 'month' }).result;
    const P = getLine(r, 'p');
    // 找第二個月的第一根
    const firstMonth = candles[0]!.time.slice(0, 7);
    const idx = candles.findIndex((c) => c.time.slice(0, 7) !== firstMonth);
    const prev = candles.slice(0, idx);
    const H = Math.max(...prev.map((c) => c.high));
    const L = Math.min(...prev.map((c) => c.low));
    const C = prev[prev.length - 1]!.close;
    expect(P[idx - 1]).toBeNull();
    expect(P[idx]).toBeCloseTo((H + L + C) / 3, 10);
    expect(getLine(r, 'r1')[idx]).toBeCloseTo((2 * (H + L + C)) / 3 - L, 10);
  });

  it('費波那契：先低後高時，從高點往下算回撤', () => {
    const c = hand([
      [11, 9, 10],
      [12, 10, 11],
      [21, 15, 20],
      [19, 16, 17],
    ]);
    const f = fibLevels(c, 10)!;
    expect(f.direction).toBe('up');
    expect(f.high).toBe(21);
    expect(f.low).toBe(9);
    const l618 = f.levels.find((l) => l.ratio === 0.618)!;
    expect(l618.value).toBeCloseTo(21 - 12 * 0.618, 10);
  });

  it('trailingQuantile 只看過去，不含當根', () => {
    const vals: Series = [5, 1, 4, 2, 3, 100];
    const q = trailingQuantile(vals, 5, 0, 5);
    expect(q[4]).toBeNull();
    // index 5 看 index 0～4：最小值 1（不包含當根的 100）
    expect(q[5]).toBe(1);
  });

  it('均線週期整理：去重、排序、包含訊號均線', () => {
    expect(maDisplayPeriods({ periods: [60, 5, 20, 5], signalPeriod: 120 })).toEqual([5, 20, 60, 120]);
  });

  it('市場常用參數會覆蓋預設值，使用者自訂再覆蓋市場值', () => {
    const def = getIndicator('rsi')!;
    expect(resolveParams(def, 'tw').period).toBe(6);
    expect(resolveParams(def, 'us').period).toBe(14);
    expect(resolveParams(def, 'tw', { period: 9 }).period).toBe(9);
  });
});

describe('所有指標的共通檢查', () => {
  // 比特幣專屬的指標需要額外資料（情緒、資金費率、鏈上），這裡給合成的
  const ctx = syntheticExtra(candles);
  for (const def of INDICATORS) {
    it(`${def.id}：長度一致、說明可產生、訊號依時間排序`, () => {
      for (const market of ['tw', 'us', 'crypto'] as const) {
        const ci = computeIndicator(def, candles, market, null, ctx);
        for (const line of ci.result.lines) expect(line.values.length).toBe(candles.length);
        const summary = describeOf(ci, candles);
        expect(summary, `${def.id} describe`).not.toBeNull();
        expect(summary!.headline.length).toBeGreaterThan(0);
        const sigs = signalsOf(ci, candles);
        for (let i = 1; i < sigs.length; i++) expect(sigs[i]!.index).toBeGreaterThan(sigs[i - 1]!.index);
        if (def.strategy) expect(sigs.length, `${def.id} 應該有訊號`).toBeGreaterThan(0);
        else expect(def.noSignalReason, `${def.id} 沒有策略就要說明原因`).toBeTruthy();
      }
    });
  }
});

describe('因果性：只用前段資料算出的結果，必須和用完整資料算的同一段一樣（不偷看未來）', () => {
  const full = syntheticCandles(700, 7);
  const cut = 450;
  const prefix = full.slice(0, cut);
  const extraCtx = syntheticExtra(full);
  for (const def of INDICATORS) {
    if (def.id === 'fibonacci') continue; // 價位是依「最近 N 根」重新找高低點，不是逐日數列
    it(def.id, () => {
      for (const market of ['tw', 'us', 'crypto'] as const) {
        const a = computeIndicator(def, full, market, null, extraCtx);
        const b = computeIndicator(def, prefix, market, null, extraCtx);
        for (const line of b.result.lines) {
          const fullLine = getLine(a.result, line.key);
          for (let i = 0; i < cut; i++) {
            const x = line.values[i];
            const y = fullLine[i];
            if (x === null) expect(y, `${line.key}[${i}]`).toBeNull();
            else expect(Math.abs((y as number) - x), `${line.key}[${i}]`).toBeLessThan(1e-9 * Math.max(1, Math.abs(x)));
          }
        }
        const sa = signalsOf(a, full).filter((s) => s.index < cut);
        expect(signalsOf(b, prefix)).toEqual(sa);
      }
    });
  }
});
