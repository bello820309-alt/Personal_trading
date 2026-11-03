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

const assetCache = new Map<string, Promise<AssetSeries>>();
let manifestCache: Promise<DataManifest | null> | null = null;

class MissingDataError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-cache' });
  if (res.status === 404) throw new MissingDataError('資料尚未產生');
  if (!res.ok) throw new Error(`讀取資料失敗（HTTP ${res.status}）`);
  return (await res.json()) as T;
}

export function loadAsset(id: string): Promise<AssetSeries> {
  let p = assetCache.get(id);
  if (!p) {
    p = getJson<AssetDataFile>(`data/${id}.json`).then(parseAssetFile);
    p.catch(() => assetCache.delete(id));
    assetCache.set(id, p);
  }
  return p;
}

export function loadManifest(): Promise<DataManifest | null> {
  if (!manifestCache) {
    manifestCache = getJson<DataManifest>('data/manifest.json').catch(() => null);
  }
  return manifestCache;
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
    loadAsset(id).then(
      (data) => alive && setState({ status: 'ready', data }),
      (e) => alive && setState(toState(e)),
    );
    return () => {
      alive = false;
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
    for (const id of key.split(',').filter(Boolean)) {
      loadAsset(id).then(
        (data) => alive && setStates((s) => ({ ...s, [id]: { status: 'ready', data } })),
        (e) => alive && setStates((s) => ({ ...s, [id]: toState<AssetSeries>(e) })),
      );
    }
    return () => {
      alive = false;
    };
  }, [key]);
  const liveVersion = useLiveVersion(ids);
  return useMemo(
    () => Object.fromEntries(Object.entries(states).map(([id, st]) => [id, withLive(st, id)])),
    [states, liveVersion],
  );
}

const extraCache = new Map<string, Promise<ExtraDataFile | null>>();

/** 額外資料（比特幣的情緒、合約、鏈上）；沒有或讀取失敗時是 null，不影響其他功能 */
export function loadExtra(id: string): Promise<ExtraDataFile | null> {
  if (!getAsset(id)?.extraData) return Promise.resolve(null);
  let p = extraCache.get(id);
  if (!p) {
    p = getJson<ExtraDataFile>(`data/${id}_extra.json`).catch(() => {
      extraCache.delete(id);
      return null;
    });
    extraCache.set(id, p);
  }
  return p;
}

export function useExtra(id: string | undefined): ExtraDataFile | null {
  const [data, setData] = useState<{ id: string; file: ExtraDataFile | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadExtra(id).then((file) => alive && setData({ id, file }));
    return () => {
      alive = false;
    };
  }, [id]);
  return data && data.id === id ? data.file : null;
}

export function useManifest(): DataManifest | null {
  const [m, setM] = useState<DataManifest | null>(null);
  useEffect(() => {
    let alive = true;
    loadManifest().then((x) => alive && setM(x));
    return () => {
      alive = false;
    };
  }, []);
  return m;
}
