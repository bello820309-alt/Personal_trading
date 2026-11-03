import { useEffect, useState } from 'react';
import type { FxDataFile } from '../data/fx';
import { cachedLoad, getJson, loadAsset, MissingDataError, onRefreshTick, type CacheEntry, type LoadState } from '../data/load';
import { completedLength } from '../data/parse';
import type { AssetSeries } from '../data/types';
import type { LabMarket } from './engine';
import type { LabAgentFile, LabExperiment } from './types';

export interface LabData {
  exp: LabExperiment;
  /** 和 exp.agents 的順序一樣 */
  agents: LabAgentFile[];
  market: LabMarket;
  /** 原始資料（用來判斷資料有沒有變，沒變就不重算） */
  sources: unknown[];
}

const expCache = new Map<string, CacheEntry<LabExperiment>>();
const agentCache = new Map<string, CacheEntry<LabAgentFile>>();
const fxCache = new Map<string, CacheEntry<FxDataFile>>();

function emptyAgent(id: string): LabAgentFile {
  return { schemaVersion: 1, id, orders: [], fills: [], journal: [] };
}

/** 實驗設定、每位參加者的紀錄、行情（只用資料檔裡已收盤的 K 棒，不用即時報價）、匯率 */
export async function loadLab(): Promise<LabData> {
  const exp = await cachedLoad(expCache, 'exp', () => getJson<LabExperiment>('lab/experiment.json'));
  const [agents, series, fx] = await Promise.all([
    Promise.all(
      exp.agents.map((a) =>
        cachedLoad(agentCache, a.id, () => getJson<LabAgentFile>(`lab/agent-${a.id}.json`)).catch((e: unknown) => {
          if (e instanceof MissingDataError) return emptyAgent(a.id);
          throw e;
        }),
      ),
    ),
    Promise.all(exp.assets.map((id) => loadAsset(id).catch(() => null))),
    cachedLoad(fxCache, 'fx', () => getJson<FxDataFile>('data/USDTWD.json')).catch(() => null),
  ]);
  const candles: LabMarket['candles'] = {};
  for (const s of series) if (s) candles[s.id] = s.candles.slice(0, completedLength(s as AssetSeries));
  return { exp, agents, market: { candles, fx }, sources: [exp, ...agents, ...series, fx] };
}

const sameSources = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function useLab(): LoadState<LabData> {
  const [state, setState] = useState<LoadState<LabData>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const apply = (d: LabData) =>
      alive && setState((s) => (s.status === 'ready' && sameSources(s.data.sources, d.sources) ? s : { status: 'ready', data: d }));
    loadLab().then(apply, (e: unknown) => {
      if (!alive) return;
      if (e instanceof MissingDataError) setState({ status: 'missing', message: '實驗的資料還沒有放上來。' });
      else setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    const stop = onRefreshTick(() => loadLab().then(apply, () => {}));
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return state;
}
