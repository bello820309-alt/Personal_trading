import { useEffect, useState } from 'react';
import { cachedLoad, getJson, loadAsset, MissingDataError, onRefreshTick, type CacheEntry, type LoadState } from '../data/load';
import { completedLength } from '../data/parse';
import type { Candle } from '../data/types';
import type { AnalystIndex, AnalystNote, AnalystNotesFile, AnalystProfile, AnalystVideoFile, CallAsset } from './types';

export interface AnalystEntry {
  profile: AnalystProfile;
  /** 新的在前 */
  notes: AnalystNote[];
  /** 自動抓的影片清單；還沒抓過是 null */
  videos: AnalystVideoFile | null;
}

export interface AnalystData {
  analysts: AnalystEntry[];
  /** 預測用到的標的：只用資料檔裡已收盤的日 K（不用即時報價） */
  candles: Partial<Record<CallAsset, Candle[]>>;
  sources: unknown[];
}

const indexCache = new Map<string, CacheEntry<AnalystIndex>>();
const notesCache = new Map<string, CacheEntry<AnalystNotesFile | null>>();
const videoCache = new Map<string, CacheEntry<AnalystVideoFile | null>>();

const orNull = (e: unknown) => {
  if (e instanceof MissingDataError) return null;
  throw e;
};

export async function loadAnalysts(): Promise<AnalystData> {
  const index = await cachedLoad(indexCache, 'index', () => getJson<AnalystIndex>('analysts/index.json'));
  const analysts = await Promise.all(
    index.analysts.map(async (profile) => {
      const [notes, videos] = await Promise.all([
        cachedLoad(notesCache, profile.id, () => getJson<AnalystNotesFile>(`analysts/${profile.id}.json`).catch(orNull)),
        cachedLoad(videoCache, profile.id, () => getJson<AnalystVideoFile>(`analysts/${profile.id}.videos.json`).catch(orNull)),
      ]);
      return { profile, notes: notes?.notes ?? [], videos };
    }),
  );
  const assets = new Set<CallAsset>();
  for (const a of analysts) for (const n of a.notes) for (const c of n.calls) if (c.kind === 'price') assets.add(c.asset);
  const series = await Promise.all([...assets].map((id) => loadAsset(id).catch(() => null)));
  const candles: AnalystData['candles'] = {};
  for (const s of series) if (s) candles[s.id as CallAsset] = s.candles.slice(0, completedLength(s));
  return { analysts, candles, sources: [index, ...analysts.flatMap((a) => [a.notes, a.videos]), ...series] };
}

const sameSources = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function useAnalysts(): LoadState<AnalystData> {
  const [state, setState] = useState<LoadState<AnalystData>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const apply = (d: AnalystData) =>
      alive && setState((s) => (s.status === 'ready' && sameSources(s.data.sources, d.sources) ? s : { status: 'ready', data: d }));
    loadAnalysts().then(apply, (e: unknown) => {
      if (!alive) return;
      if (e instanceof MissingDataError) setState({ status: 'missing', message: '還沒有追蹤任何分析師。' });
      else setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    const stop = onRefreshTick(() => loadAnalysts().then(apply, () => {}));
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return state;
}
