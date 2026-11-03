import { useEffect, useMemo, useState } from 'react';
import { getAsset } from '../config/assets';
import { mergeLiveBars } from './live/merge';
import { getLiveState, hasLive, useLiveVersion } from './live/store';
import { parseAssetFile } from './parse';
import type { ExtraDataFile } from './extra';
import type { AssetDataFile, AssetSeries, DataManifest } from './types';

const BASE = import.meta.env.BASE_URL;

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'missing'; message: string }
  | { status: 'error'; message: string };

/**
 * 資料讀進來之後在記憶體裡放多久，就要重新向伺服器確認一次。
 * 每次打開網頁都會拿最新的檔案；這個設定是給「網頁或手機 App 一直開著」的情況：
 * 放在背景好幾天再切回來時，會自動換成最新的收盤資料，所有計算（指標、回測、預測）跟著重算。
 */
export const DATA_MAX_AGE_MS = 30 * 60 * 1000;

export interface CacheEntry<T> {
  p: Promise<T>;
  at: number;
}

const assetCache = new Map<string, CacheEntry<AssetSeries>>();
const manifestCache = new Map<string, CacheEntry<DataManifest>>();

export class MissingDataError extends Error {}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-cache' });
  if (res.status === 404) throw new MissingDataError('資料尚未產生');
  if (!res.ok) throw new Error(`讀取資料失敗（HTTP ${res.status}）`);
  return (await res.json()) as T;
}

/**
 * 有快取而且還不舊就直接用；太舊就重新抓。重新抓失敗（例如離線）時繼續用手上的資料，
 * 第一次就抓不到時才回報錯誤（並清掉快取，下次重試）。
 */
export function cachedLoad<T>(cache: Map<string, CacheEntry<T>>, key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < DATA_MAX_AGE_MS) return hit.p;
  const prev = hit?.p;
  const p: Promise<T> = load().catch((e: unknown) => {
    if (prev) return prev;
    if (cache.get(key)?.p === p) cache.delete(key);
    throw e;
  });
  cache.set(key, { p, at: now });
  return p;
}

export function loadAsset(id: string): Promise<AssetSeries> {
  return cachedLoad(assetCache, id, () => getJson<AssetDataFile>(`data/${id}.json`).then(parseAssetFile));
}

export function loadManifest(): Promise<DataManifest | null> {
  return cachedLoad(manifestCache, 'manifest', () => getJson<DataManifest>('data/manifest.json')).catch(() => null);
}

/**
 * 網頁從背景切回前景時、以及開著的時候每隔一段時間，呼叫 check（太舊的資料會重新抓）。
 * 回傳取消註冊的函式。
 */
export function onRefreshTick(check: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const tick = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', tick);
  const timer = window.setInterval(tick, DATA_MAX_AGE_MS);
  return () => {
    document.removeEventListener('visibilitychange', tick);
    window.clearInterval(timer);
  };
}

function toState<T>(e: unknown): LoadState<T> {
  if (e instanceof MissingDataError) {
    return {
      status: 'missing',
      message: '還沒有這個標的的資料。GitHub Actions 第一次抓完資料、重新部署後就會出現。',
    };
  }
  return { status: 'error', message: e instanceof Error ? e.message : String(e) };
}

/**
 * 有即時報價的標的（比特幣）：把每分鐘抓到的即時 K 棒接到歷史資料後面。
 * 即時資料還沒抓到或抓取失敗時，照常使用歷史資料，並把狀態放在 data.live 讓畫面說明。
 */
function withLive(state: LoadState<AssetSeries>, id: string): LoadState<AssetSeries> {
  if (state.status !== 'ready' || !hasLive(id)) return state;
  const source = getAsset(id)!.live!.label;
  const live = getLiveState(id);
  if (!live?.bars) {
    return { status: 'ready', data: { ...state.data, live: { source, fetchedAt: null, error: live?.error ?? null } } };
  }
  const merged = mergeLiveBars(state.data, live.bars, Date.now());
  return { status: 'ready', data: { ...merged, live: { source, fetchedAt: live.fetchedAt, error: live.error } } };
}

export function useAsset(id: string | undefined): LoadState<AssetSeries> {
  const [state, setState] = useState<LoadState<AssetSeries>>({ status: 'loading' });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState({ status: 'loading' });
    // 同一份資料就不更新畫面，避免沒必要的重算
    const apply = (data: AssetSeries) => alive && setState((s) => (s.status === 'ready' && s.data === data ? s : { status: 'ready', data }));
    loadAsset(id).then(apply, (e) => alive && setState(toState(e)));
    const stop = onRefreshTick(() => loadAsset(id).then(apply, () => {}));
    return () => {
      alive = false;
      stop();
    };
  }, [id]);
  const liveVersion = useLiveVersion(id ? [id] : []);
  // liveVersion 每次即時資料更新就會變，讓合併結果重新計算
  return useMemo(() => (id ? withLive(state, id) : state), [state, id, liveVersion]);
}

export function useAssets(ids: string[]): Record<string, LoadState<AssetSeries>> {
  const key = ids.join(',');
  const [states, setStates] = useState<Record<string, LoadState<AssetSeries>>>(() =>
    Object.fromEntries(ids.map((id) => [id, { status: 'loading' } as LoadState<AssetSeries>])),
  );
  useEffect(() => {
    let alive = true;
    const ids = key.split(',').filter(Boolean);
    const apply = (id: string, data: AssetSeries) =>
      alive && setStates((s) => (s[id]?.status === 'ready' && (s[id] as { data: AssetSeries }).data === data ? s : { ...s, [id]: { status: 'ready', data } }));
    for (const id of ids) {
      loadAsset(id).then(
        (data) => apply(id, data),
        (e) => alive && setStates((s) => ({ ...s, [id]: toState<AssetSeries>(e) })),
      );
    }
    const stop = onRefreshTick(() => {
      for (const id of ids) loadAsset(id).then((data) => apply(id, data), () => {});
    });
    return () => {
      alive = false;
      stop();
    };
  }, [key]);
  const liveVersion = useLiveVersion(ids);
  return useMemo(
    () => Object.fromEntries(Object.entries(states).map(([id, st]) => [id, withLive(st, id)])),
    [states, liveVersion],
  );
}

const extraCache = new Map<string, CacheEntry<ExtraDataFile>>();

/** 額外資料（比特幣的情緒、合約、鏈上）；沒有或讀取失敗時是 null，不影響其他功能 */
export function loadExtra(id: string): Promise<ExtraDataFile | null> {
  if (!getAsset(id)?.extraData) return Promise.resolve(null);
  return cachedLoad(extraCache, id, () => getJson<ExtraDataFile>(`data/${id}_extra.json`)).catch(() => null);
}

export function useExtra(id: string | undefined): ExtraDataFile | null {
  const [data, setData] = useState<{ id: string; file: ExtraDataFile | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const apply = (file: ExtraDataFile | null) => alive && setData((d) => (d && d.id === id && d.file === file ? d : { id, file }));
    loadExtra(id).then(apply);
    const stop = onRefreshTick(() => loadExtra(id).then(apply));
    return () => {
      alive = false;
      stop();
    };
  }, [id]);
  return data && data.id === id ? data.file : null;
}

export function useManifest(): DataManifest | null {
  const [m, setM] = useState<DataManifest | null>(null);
  useEffect(() => {
    let alive = true;
    const apply = (x: DataManifest | null) => alive && setM((old) => (old === x ? old : x));
    loadManifest().then(apply);
    const stop = onRefreshTick(() => loadManifest().then(apply));
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return m;
}
