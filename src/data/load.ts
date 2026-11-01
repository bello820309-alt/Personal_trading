import { useEffect, useState } from 'react';
import { parseAssetFile } from './parse';
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
  return state;
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
  return states;
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
