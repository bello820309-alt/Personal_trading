import { describe, expect, it } from 'vitest';
import type { AssetSeries, Candle } from '../types';
import { fetchBinanceDaily, parseBinanceKlines } from './binance';
import { mergeLiveBars } from './merge';

/*
 * 依幣安 API 文件的 K 棒格式組出來的樣本（不是真實行情），用來驗證解析與合併邏輯。
 * 格式：[開盤時間, 開, 高, 低, 收, 成交量(幣), 收盤時間, 成交值(USDT), 筆數, 主動買量, 主動買值, 忽略]
 */
function kline(date: string, o: number, h: number, l: number, c: number, quoteVol: number): unknown[] {
  const open = Date.parse(`${date}T00:00:00Z`);
  return [open, String(o), String(h), String(l), String(c), String(quoteVol / c), open + 86_400_000 - 1, String(quoteVol), 1000, '0', '0', '0'];
}

function day(i: number): string {
  return new Date(Date.UTC(2026, 9, 20 + i)).toISOString().slice(0, 10);
}

describe('parseBinanceKlines', () => {
  it('把幣安的 K 棒轉成日期與數字', () => {
    const [bar] = parseBinanceKlines([kline('2026-11-01', 100, 110, 95, 105, 5000)]);
    expect(bar).toMatchObject({ time: '2026-11-01', open: 100, high: 110, low: 95, close: 105, quoteVolume: 5000 });
    expect(bar!.closeTime).toBe(Date.parse('2026-11-02T00:00:00Z') - 1);
  });

  it('依日期排序，略過格式不對的資料', () => {
    const bars = parseBinanceKlines([kline('2026-11-02', 1, 1, 1, 1, 1), ['壞掉的'], kline('2026-11-01', 2, 2, 2, 2, 2)]);
    expect(bars.map((b) => b.time)).toEqual(['2026-11-01', '2026-11-02']);
  });

  it('回應不是 K 棒陣列就丟出錯誤', () => {
    expect(() => parseBinanceKlines({ code: -1121, msg: 'Invalid symbol.' })).toThrow();
    expect(() => parseBinanceKlines([])).toThrow();
  });
});

describe('fetchBinanceDaily', () => {
  it('第一個網址失敗時改用第二個', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      if (urls.length === 1) return new Response('blocked', { status: 451 });
      return new Response(JSON.stringify([kline('2026-11-01', 1, 2, 0.5, 1.5, 10)]), { status: 200 });
    }) as unknown as typeof fetch;
    const bars = await fetchBinanceDaily('BTCUSDT', 60, fake);
    expect(bars).toHaveLength(1);
    expect(urls[0]).toBe('https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=60');
    expect(urls[1]).toContain('https://api.binance.com/api/v3/klines');
  });

  it('全部失敗就丟出錯誤', async () => {
    const fake = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(fetchBinanceDaily('BTCUSDT', 60, fake)).rejects.toThrow('HTTP 500');
  });
});

describe('mergeLiveBars', () => {
  // 歷史（Yahoo）：10/20～10/29 共 10 天已收盤，加上 10/30 盤中抓到、尚未收盤的一根
  function history(): AssetSeries {
    const candles: Candle[] = Array.from({ length: 11 }, (_, i) => ({
      time: day(i),
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
      volume: 15 * 1000 * (i + 1), // 是幣安成交值的 15 倍
    }));
    return {
      id: 'BTC',
      meta: {
        schemaVersion: 1,
        id: 'BTC',
        symbol: 'BTC-USD',
        source: 'Yahoo Finance',
        currency: 'USD',
        timezone: 'UTC',
        updatedAt: '2026-10-30T05:00:00.000Z',
        lastBarComplete: false,
        events: { dividends: [], splits: [] },
      },
      candles,
      adjClose: candles.map((c) => c.close),
    };
  }
  // 幣安：10/22～11/01（和歷史重疊 8 天，之後多 3 天，最後一根是 11/01 盤中）
  const bars = parseBinanceKlines(Array.from({ length: 11 }, (_, k) => {
    const i = k + 2;
    return kline(day(i), 100 + i, 102 + i, 99 + i, 101.5 + i, 1000 * (i + 1));
  }));
  const duringNov1 = Date.parse('2026-11-01T08:00:00Z');

  it('丟掉歷史裡尚未收盤的那根，接上之後的即時 K 棒', () => {
    const merged = mergeLiveBars(history(), bars, duringNov1);
    const times = merged.candles.map((c) => c.time);
    expect(times.slice(0, 10)).toEqual(history().candles.slice(0, 10).map((c) => c.time));
    expect(times.slice(10)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    // 10/30 改用幣安的價格（歷史那根是盤中抓的）
    expect(merged.candles[10]!.close).toBe(111.5);
    expect(merged.adjClose[12]).toBe(113.5);
    expect(merged.adjClose).toHaveLength(merged.candles.length);
  });

  it('幣安的成交量依重疊日期的比例換算到同一個量級', () => {
    const merged = mergeLiveBars(history(), bars, duringNov1);
    // 10/31（i = 11）幣安成交值 12000 × 比例 15
    expect(merged.candles[11]!.volume).toBe(180_000);
  });

  it('今天的 K 棒還沒收盤 → 標成未收盤；過了收盤時間 → 已收盤', () => {
    expect(mergeLiveBars(history(), bars, duringNov1).meta.lastBarComplete).toBe(false);
    expect(mergeLiveBars(history(), bars, Date.parse('2026-11-02T00:00:01Z')).meta.lastBarComplete).toBe(true);
  });

  it('即時資料沒有比歷史新的日子時，只保留已收盤的歷史', () => {
    const old = parseBinanceKlines([kline(day(3), 1, 1, 1, 1, 1)]);
    const merged = mergeLiveBars(history(), old, duringNov1);
    expect(merged.candles).toHaveLength(10);
    expect(merged.meta.lastBarComplete).toBe(true);
  });
});
