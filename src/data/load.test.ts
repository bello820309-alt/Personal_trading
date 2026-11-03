import { describe, expect, it, vi } from 'vitest';
import { DATA_MAX_AGE_MS, cachedLoad } from './load';

type Entry = { p: Promise<number>; at: number };

describe('cachedLoad：資料太舊就重新抓，抓不到就繼續用手上的', () => {
  it('還不舊時直接用快取，不重新抓', async () => {
    const cache = new Map<string, Entry>();
    const load = vi.fn(() => Promise.resolve(1));
    const t0 = 1_000_000;
    await cachedLoad(cache, 'BTC', load, t0);
    await cachedLoad(cache, 'BTC', load, t0 + DATA_MAX_AGE_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('超過時間就重新抓，拿到新的資料', async () => {
    const cache = new Map<string, Entry>();
    let v = 1;
    const load = vi.fn(() => Promise.resolve(v));
    const t0 = 1_000_000;
    expect(await cachedLoad(cache, 'BTC', load, t0)).toBe(1);
    v = 2; // 伺服器上的資料更新了
    expect(await cachedLoad(cache, 'BTC', load, t0 + DATA_MAX_AGE_MS)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('重新抓失敗（例如離線）時，繼續用舊的資料', async () => {
    const cache = new Map<string, Entry>();
    const t0 = 1_000_000;
    await cachedLoad(cache, 'BTC', () => Promise.resolve(1), t0);
    const v = await cachedLoad(cache, 'BTC', () => Promise.reject(new Error('offline')), t0 + DATA_MAX_AGE_MS);
    expect(v).toBe(1);
  });

  it('第一次就抓不到時回報錯誤，並清掉快取讓下次重試', async () => {
    const cache = new Map<string, Entry>();
    await expect(cachedLoad(cache, 'BTC', () => Promise.reject(new Error('404')), 1)).rejects.toThrow('404');
    expect(cache.has('BTC')).toBe(false);
    expect(await cachedLoad(cache, 'BTC', () => Promise.resolve(3), 2)).toBe(3);
  });
});
