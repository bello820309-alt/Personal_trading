import { toCompact, type ExtraDataFile } from '../data/extra';
import type { Candle } from '../data/types';
import type { IndicatorContext } from './types';

/**
 * 只給單元測試用的「合成比特幣額外資料」（情緒、資金費率、鏈上），日期和 K 棒一致，
 * 數值是會穿越各個門檻的波浪，用來驗證比特幣專屬指標的計算與訊號。不是真實資料。
 */
export function syntheticExtra(candles: Candle[]): IndicatorContext {
  const t = candles.map((c) => c.time);
  const wave = (f: (i: number) => number) => toCompact(t, t.map((_, i) => f(i)));
  const s = (label: string, c: ReturnType<typeof toCompact>) => ({ label, unit: '', source: 'test', ...c });
  const extra: ExtraDataFile = {
    schemaVersion: 1,
    asset: 'BTC',
    updatedAt: '2026-01-01T00:00:00Z',
    series: {
      fng: s('fng', wave((i) => Math.round(50 + 45 * Math.sin(i / 25)))),
      funding: s('funding', wave((i) => 0.0003 * Math.sin(i / 20) + 0.00005)),
      mvrv: s('mvrv', wave((i) => 2.2 + 1.8 * Math.sin(i / 40))),
      activeAddresses: s('activeAddresses', wave((i) => 700000 + 200000 * Math.sin(i / 30))),
      txCount: s('txCount', wave((i) => 300000 + 50000 * Math.sin(i / 30))),
      hashRate: s('hashRate', wave((i) => 1e8 * (1 + i / 1000) * (1 + 0.1 * Math.sin(i / 15)))),
    },
  };
  return { extra };
}

/**
 * 只給單元測試用的「合成價格序列」（固定亂數種子、每次都一樣），
 * 用來驗證指標的數學算得對不對。不是真實行情，App 裡不會用到。
 */
export function syntheticCandles(n: number, seed = 42, start = 100): Candle[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: Candle[] = [];
  let close = start;
  const d = new Date(Date.UTC(2015, 0, 1));
  for (let i = 0; i < n; i++) {
    // 每 200 根換一次趨勢方向，讓序列同時有上漲、下跌、盤整
    const drift = Math.sin(i / 60) * 0.004;
    const shock = (rand() - 0.5) * 0.04;
    const open = close * (1 + (rand() - 0.5) * 0.01);
    close = Math.max(1, close * (1 + drift + shock));
    const high = Math.max(open, close) * (1 + rand() * 0.015);
    const low = Math.min(open, close) * (1 - rand() * 0.015);
    const volume = Math.round(1_000_000 * (0.5 + rand()) * (1 + Math.abs(shock) * 20));
    d.setUTCDate(d.getUTCDate() + 1);
    out.push({ time: d.toISOString().slice(0, 10), open, high, low, close, volume });
  }
  return out;
}
