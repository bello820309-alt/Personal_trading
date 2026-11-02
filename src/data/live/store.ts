import { useCallback, useSyncExternalStore } from 'react';
import { getAsset } from '../../config/assets';
import { fetchBinanceDaily, type LiveBar } from './binance';

/*
 * 即時資料的共用更新器：同一個標的不管有幾個畫面在用，都只會有一個計時器。
 * 頁面開著時每 60 秒抓一次；切到背景時暫停，回到畫面時馬上補抓。
 */

export const LIVE_INTERVAL_MS = 60_000;

export interface LiveState {
  bars: LiveBar[] | null;
  /** 最近一次成功的時間 */
  fetchedAt: number | null;
  /** 最近一次失敗的原因（成功時是 null） */
  error: string | null;
}

const states = new Map<string, LiveState>();
const listeners = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setInterval>>();
const inflight = new Set<string>();
let version = 0;

function emit(id: string): void {
  version++;
  listeners.get(id)?.forEach((l) => l());
}

function describe(e: unknown): string {
  if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) return '連線逾時';
  if (e instanceof TypeError) return '網路連不上';
  return e instanceof Error ? e.message : String(e);
}

async function refresh(id: string): Promise<void> {
  const live = getAsset(id)?.live;
  if (!live || inflight.has(id)) return;
  inflight.add(id);
  try {
    const bars = await fetchBinanceDaily(live.symbol);
    states.set(id, { bars, fetchedAt: Date.now(), error: null });
  } catch (e) {
    const prev = states.get(id);
    states.set(id, { bars: prev?.bars ?? null, fetchedAt: prev?.fetchedAt ?? null, error: describe(e) });
  } finally {
    inflight.delete(id);
    emit(id);
  }
}

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function start(id: string): void {
  if (timers.has(id)) return;
  const s = states.get(id);
  if (!s?.fetchedAt || Date.now() - s.fetchedAt > LIVE_INTERVAL_MS / 2) void refresh(id);
  timers.set(
    id,
    setInterval(() => {
      if (isVisible()) void refresh(id);
    }, LIVE_INTERVAL_MS),
  );
}

function stop(id: string): void {
  const t = timers.get(id);
  if (t) clearInterval(t);
  timers.delete(id);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!isVisible()) return;
    for (const id of timers.keys()) {
      const s = states.get(id);
      if (!s?.fetchedAt || Date.now() - s.fetchedAt > LIVE_INTERVAL_MS) void refresh(id);
    }
  });
}

function subscribe(id: string, cb: () => void): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(cb);
  start(id);
  return () => {
    set.delete(cb);
    if (set.size === 0) stop(id);
  };
}

export function getLiveState(id: string): LiveState | undefined {
  return states.get(id);
}

export function hasLive(id: string): boolean {
  return !!getAsset(id)?.live;
}

/** 訂閱這些標的的即時資料；回傳的版本號每次有更新就會變，讓畫面重新整理 */
export function useLiveVersion(ids: string[]): number {
  const key = ids.filter(hasLive).join(',');
  const sub = useCallback(
    (cb: () => void) => {
      const unsubs = key
        .split(',')
        .filter(Boolean)
        .map((id) => subscribe(id, cb));
      return () => unsubs.forEach((u) => u());
    },
    [key],
  );
  return useSyncExternalStore(
    sub,
    () => version,
    () => 0,
  );
}
