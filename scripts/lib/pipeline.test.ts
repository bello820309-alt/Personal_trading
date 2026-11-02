import { describe, expect, it } from 'vitest';
import { ASSETS, getAsset } from '../../src/config/assets';
import type { AssetDataFile } from '../../src/data/types';
import { fetchYahooChart } from './yahoo';
import { normalizeYahooChart, stringifyAssetFile } from './normalize';
import { validateAssetFile } from './validate';

/*
 * 這些測試用「依 Yahoo 回應格式手工組出來的結構」驗證解析邏輯（不是真實行情）。
 * 真實資料的驗證在 GitHub Actions 抓取之後，用 npm run validate-data 進行。
 */

const tw = getAsset('0050')!;
const btc = getAsset('BTC')!;

/** 依 Yahoo v8 chart 的結構組一個回應 */
function yahooLike(opts: {
  start: number;
  days: number;
  tz: string;
  currency: string;
  price?: (i: number) => number;
  extra?: (r: Record<string, unknown>) => void;
}) {
  const ts: number[] = [];
  const o: (number | null)[] = [];
  const h: (number | null)[] = [];
  const l: (number | null)[] = [];
  const c: (number | null)[] = [];
  const v: (number | null)[] = [];
  const ac: (number | null)[] = [];
  for (let i = 0; i < opts.days; i++) {
    const p = opts.price ? opts.price(i) : 100 + i * 0.1;
    ts.push(opts.start + i * 86400);
    o.push(p);
    h.push(p * 1.01);
    l.push(p * 0.99);
    c.push(p * 1.002);
    v.push(1000 + i);
    ac.push(p * 1.002 * 0.9);
  }
  const result: Record<string, unknown> = {
    meta: {
      currency: opts.currency,
      exchangeTimezoneName: opts.tz,
      currentTradingPeriod: { regular: { start: 0, end: 0 } },
    },
    timestamp: ts,
    events: {
      dividends: { [String(ts[10])]: { amount: 1.5, date: ts[10] } },
      splits: { [String(ts[20])]: { date: ts[20], numerator: 4, denominator: 1 } },
    },
    indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: v }], adjclose: [{ adjclose: ac }] },
  };
  opts.extra?.(result);
  return { chart: { result: [result], error: null } };
}

// 2024-01-02 01:00 UTC = 台北 09:00（台股開盤時間）
const TW_START = Date.UTC(2024, 0, 2, 1, 0, 0) / 1000;

describe('normalizeYahooChart', () => {
  it('把時間換成交易所當地日期，並整理成欄位陣列', () => {
    const json = yahooLike({ start: TW_START, days: 300, tz: 'Asia/Taipei', currency: 'TWD' });
    const { file, currency } = normalizeYahooChart(json, tw, new Date(Date.UTC(2025, 0, 1)));
    expect(currency).toBe('TWD');
    expect(file.bars.t[0]).toBe('2024-01-02');
    expect(file.bars.t.length).toBe(300);
    expect(file.events.dividends[0]).toEqual({ date: '2024-01-12', amount: 1.5 });
    expect(file.events.splits[0]).toEqual({ date: '2024-01-22', numerator: 4, denominator: 1 });
    expect(file.lastBarComplete).toBe(true);
    expect(file.bars.ac[0]).toBeCloseTo(100 * 1.002 * 0.9, 4);
  });

  it('略過空值、修正高低價、同一天重複時保留最後一筆', () => {
    const json = yahooLike({
      start: TW_START,
      days: 5,
      tz: 'Asia/Taipei',
      currency: 'TWD',
      extra: (r) => {
        const q = (r.indicators as { quote: Record<string, (number | null)[]>[] }).quote[0]!;
        q.close![1] = null; // 空值（例如颱風假）
        q.high![2] = 50; // 最高價比收盤低（資料錯誤）
        // 同一天又出現一筆（盤中即時報價）
        (r.timestamp as number[]).push(TW_START + 4 * 86400 + 3600);
        for (const k of ['open', 'high', 'low', 'close', 'volume'] as const) q[k]!.push(k === 'volume' ? 9999 : 200);
        (r.indicators as { adjclose: { adjclose: number[] }[] }).adjclose[0]!.adjclose.push(200);
      },
    });
    const { file, warnings } = normalizeYahooChart(json, tw, new Date(Date.UTC(2025, 0, 1)));
    expect(file.bars.t).toEqual(['2024-01-02', '2024-01-04', '2024-01-05', '2024-01-06']);
    expect(file.bars.h[1]).toBeGreaterThanOrEqual(file.bars.c[1]!);
    expect(file.bars.c[3]).toBe(200);
    expect(file.bars.v[3]).toBe(9999);
    expect(warnings.join()).toContain('空值');
  });

  it('股票：零成交量且開高低收相同的休市日會被略過；有成交量的一字跌停會保留', () => {
    const json = yahooLike({
      start: TW_START,
      days: 6,
      tz: 'Asia/Taipei',
      currency: 'TWD',
      extra: (r) => {
        const q = (r.indicators as { quote: Record<string, (number | null)[]>[] }).quote[0]!;
        // index 2：颱風假（Yahoo 用前一天收盤補一根、成交量 0）
        for (const k of ['open', 'high', 'low', 'close'] as const) q[k]![2] = 50;
        q.volume![2] = 0;
        // index 4：一字跌停（開高低收相同，但有成交量）
        for (const k of ['open', 'high', 'low', 'close'] as const) q[k]![4] = 45;
        q.volume![4] = 123456;
      },
    });
    const { file, warnings } = normalizeYahooChart(json, tw, new Date(Date.UTC(2025, 0, 1)));
    expect(file.bars.t).toEqual(['2024-01-02', '2024-01-03', '2024-01-05', '2024-01-06', '2024-01-07']);
    expect(file.bars.c[3]).toBe(45);
    expect(warnings.join()).toContain('休市日');
    // 加密貨幣沒有休市，不套用這條規則
    const crypto = normalizeYahooChart(json, btc, new Date(Date.UTC(2025, 0, 1)));
    expect(crypto.file.bars.t.length).toBe(6);
  });

  it('加密貨幣：今天（UTC）還沒收盤的 K 棒不寫入檔案（網頁會直接向幣安取得）', () => {
    const start = Date.UTC(2024, 0, 1) / 1000;
    const json = yahooLike({ start, days: 300, tz: 'UTC', currency: 'USD' });
    const lastDay = new Date((start + 299 * 86400) * 1000);
    const { file, warnings } = normalizeYahooChart(json, btc, new Date(lastDay.getTime() + 5 * 3600 * 1000));
    expect(file.bars.t).toHaveLength(299);
    expect(file.bars.t[298]).toBe(new Date((start + 298 * 86400) * 1000).toISOString().slice(0, 10));
    expect(file.lastBarComplete).toBe(true);
    expect(warnings.join()).toContain('尚未收盤');
  });

  it('股票：盤中抓到的今天 K 棒不寫入，收盤後才寫入', () => {
    const json = yahooLike({
      start: TW_START,
      days: 300,
      tz: 'Asia/Taipei',
      currency: 'TWD',
      extra: (r) => {
        // 今天的收盤時間（台北 13:30 = UTC 05:30）
        const lastOpen = TW_START + 299 * 86400;
        (r.meta as { currentTradingPeriod: { regular: { end: number } } }).currentTradingPeriod.regular.end = lastOpen + 4.5 * 3600;
      },
    });
    const lastOpenMs = (TW_START + 299 * 86400) * 1000;
    const during = normalizeYahooChart(json, tw, new Date(lastOpenMs + 2 * 3600 * 1000)).file;
    expect(during.bars.t).toHaveLength(299);
    const after = normalizeYahooChart(json, tw, new Date(lastOpenMs + 6 * 3600 * 1000)).file;
    expect(after.bars.t).toHaveLength(300);
  });

  it('輸出的 JSON 可以被正常讀回', () => {
    const json = yahooLike({ start: TW_START, days: 260, tz: 'Asia/Taipei', currency: 'TWD' });
    const { file } = normalizeYahooChart(json, tw, new Date(Date.UTC(2025, 0, 1)));
    const back = JSON.parse(stringifyAssetFile(file)) as AssetDataFile;
    expect(back).toEqual(file);
  });

  it('有設定 historyStart 時，只保留那天以後的資料', () => {
    const json = yahooLike({ start: TW_START, days: 300, tz: 'Asia/Taipei', currency: 'TWD' });
    const custom = { ...tw, historyStart: '2024-03-01' };
    const { file, warnings } = normalizeYahooChart(json, custom, new Date(Date.UTC(2025, 0, 1)));
    expect(file.bars.t[0]).toBe('2024-03-01');
    expect(file.events.dividends).toEqual([]);
    expect(warnings.join()).toContain('2024-03-01');
  });

  it('0050 設定從 2014-01-02 開始（避開 Yahoo 未調整分割的舊資料）', () => {
    expect(tw.historyStart).toBe('2014-01-02');
  });

  it('沒有資料時丟出錯誤', () => {
    expect(() => normalizeYahooChart({ chart: { result: [] } }, tw, new Date())).toThrow();
  });
});

describe('validateAssetFile', () => {
  const now = new Date(Date.UTC(2024, 11, 1));
  const make = (price?: (i: number) => number) =>
    normalizeYahooChart(yahooLike({ start: TW_START, days: 300, tz: 'Asia/Taipei', currency: 'TWD', price }), tw, now).file;

  it('正常資料沒有錯誤', () => {
    expect(validateAssetFile(make(), tw, null, now, 'TWD').errors).toEqual([]);
  });

  it('幣別不符（代號抓錯）會報錯', () => {
    expect(validateAssetFile(make(), tw, null, now, 'USD').errors.join()).toContain('幣別');
  });

  it('沒有調整的分割（價格突然變 1/4）會報錯', () => {
    const f = make((i) => (i < 150 ? 200 : 50));
    expect(validateAssetFile(f, tw, null, now).errors.join()).toContain('單日漲跌');
  });

  it('歷史價格和上一版差很多（且沒有新分割）會拒絕覆蓋', () => {
    const prev = make();
    const next = make((i) => 120 + i * 0.1);
    next.events.splits = prev.events.splits;
    expect(validateAssetFile(next, tw, prev, now).errors.join()).toContain('歷史收盤價');
  });

  it('資料變少會報錯', () => {
    const prev = make();
    const next = structuredClone(prev);
    for (const k of Object.keys(next.bars) as (keyof AssetDataFile['bars'])[]) next.bars[k] = next.bars[k].slice(0, 280) as never;
    expect(validateAssetFile(next, tw, prev, now).errors.join()).toContain('變少');
  });
});

describe('fetchYahooChart', () => {
  it('失敗時重試並換主機', async () => {
    const urls: string[] = [];
    let calls = 0;
    const fake = (async (url: string) => {
      urls.push(url);
      calls++;
      if (calls < 3) return new Response('busy', { status: 429, statusText: 'Too Many Requests' });
      return new Response(JSON.stringify({ chart: { result: [{}], error: null } }), { status: 200 });
    }) as unknown as typeof fetch;
    const json = await fetchYahooChart('0050.TW', { fetchImpl: fake, baseDelayMs: 1 });
    expect(json).toEqual({ chart: { result: [{}], error: null } });
    expect(urls[0]).toContain('query2.finance.yahoo.com/v8/finance/chart/0050.TW');
    expect(urls[1]).toContain('query1.finance.yahoo.com');
    expect(urls[0]).toContain('interval=1d');
  });

  it('全部失敗就丟出最後的錯誤', async () => {
    const fake = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await expect(fetchYahooChart('VOO', { fetchImpl: fake, baseDelayMs: 1, attempts: 2 })).rejects.toThrow('HTTP 500');
  });
});

describe('標的設定', () => {
  it('每個標的都有不重複的 id 和 Yahoo 代號', () => {
    expect(new Set(ASSETS.map((a) => a.id)).size).toBe(ASSETS.length);
    expect(ASSETS.map((a) => a.symbol)).toEqual(['0050.TW', 'VOO', 'BTC-USD']);
  });
});
