import type { Candle } from '../data/types';
import { localTime, zonedTime } from '../lab/time';
import type { AnalystCall, AnalystNote, CallAsset, EventCall, PriceCall } from './types';

/*
 * 分析師的預測說對了沒：用本站每天的收盤資料（只用已收盤的 K 棒）。
 *
 * - 從影片上傳之後才開盤的第一根 K 棒開始算：上傳時已經開盤的那根，有一部分是上傳之前的價格，不算。
 *   （例如台灣早上 7 點上傳，0050 當天 9 點才開盤，當天就算；晚上 11 點上傳，從隔天開始算）
 * - 期限內任何一天的最低價（看跌）或最高價（看漲）碰到目標價，就算說對。
 * - 有條件的預測（先跌破 A，才會再跌到 B）：先碰到 A 才開始等 B；到期都沒碰到 A，就是「條件沒發生」，不算對也不算錯。
 * - 資料已經涵蓋到期限那天、還沒碰到目標，就算說錯。
 */

export type CallStatus = 'pending' | 'hit' | 'miss' | 'void';

export const STATUS_LABELS: Record<CallStatus, string> = {
  pending: '等待結果',
  hit: '說對了',
  miss: '說錯了',
  void: '條件沒發生',
};

/** 各市場的日期用哪個時區（和資料檔的 K 棒日期一致） */
export const ASSET_TZ: Record<CallAsset, string> = {
  '0050': 'Asia/Taipei',
  VOO: 'America/New_York',
  BTC: 'UTC',
};

/** 各市場一根日 K 從當地幾點開始（比特幣的日 K 從 UTC 0 點、台灣早上 8 點開始） */
export const BAR_OPEN: Record<CallAsset, string> = {
  '0050': '09:00',
  VOO: '09:30',
  BTC: '00:00',
};

/** 這根日 K 是不是在影片上傳之後才開盤 */
export function opensAfter(asset: CallAsset, barDate: string, publishedMs: number): boolean {
  return zonedTime(barDate, BAR_OPEN[asset], ASSET_TZ[asset]) >= publishedMs;
}

export interface PricePoint {
  price: number;
  date: string;
}

export interface CallResult {
  status: CallStatus;
  /** 影片上傳時，該市場的當地日期（這天之前的 K 棒都不算；這天的 K 棒要上傳之後才開盤才算） */
  from: string;
  /** 條件（trigger）成立的那天 */
  triggeredOn?: string;
  /** 碰到目標的那天 */
  hitOn?: string;
  /** 開始算到現在（最多到期限），往預測的方向最遠到哪：看跌是最低價，看漲是最高價 */
  extreme?: PricePoint;
  /** 最新收盤 */
  last?: PricePoint;
  /** 事件預測已經過了期限、還沒標記結果 */
  overdue?: boolean;
}

const touched = (c: Candle, level: number, dir: 'down' | 'up') => (dir === 'down' ? c.low <= level : c.high >= level);

/** candles：這個標的已收盤的日 K（舊到新） */
export function evaluatePriceCall(call: PriceCall, published: string, candles: Candle[]): CallResult {
  const publishedMs = Date.parse(published);
  const from = localTime(publishedMs, ASSET_TZ[call.asset]).date;
  const lastBar = candles[candles.length - 1];
  const out: CallResult = { status: 'pending', from };
  if (lastBar) out.last = { price: lastBar.close, date: lastBar.time };
  let triggered = call.trigger === undefined;
  for (const c of candles) {
    if (c.time < from || (c.time === from && !opensAfter(call.asset, c.time, publishedMs))) continue;
    if (c.time > call.by) break;
    const far = call.direction === 'down' ? c.low : c.high;
    if (!out.extreme || (call.direction === 'down' ? far < out.extreme.price : far > out.extreme.price)) {
      out.extreme = { price: far, date: c.time };
    }
    if (!triggered && touched(c, call.trigger!, call.direction)) {
      triggered = true;
      out.triggeredOn = c.time;
    }
    if (triggered && touched(c, call.target, call.direction)) {
      out.hitOn = c.time;
      out.status = 'hit';
      return out;
    }
  }
  if (lastBar && lastBar.time >= call.by) out.status = triggered ? 'miss' : 'void';
  return out;
}

/** today：台灣日期（YYYY-MM-DD） */
export function evaluateEventCall(call: EventCall, today: string): CallResult {
  const out: CallResult = { status: call.result ?? 'pending', from: '' };
  if (!call.result && today > call.by) out.overdue = true;
  return out;
}

export function evaluateCall(call: AnalystCall, published: string, candles: Partial<Record<CallAsset, Candle[]>>, today: string): CallResult {
  return call.kind === 'price' ? evaluatePriceCall(call, published, candles[call.asset] ?? []) : evaluateEventCall(call, today);
}

export interface EvaluatedCall {
  call: AnalystCall;
  note: AnalystNote;
  result: CallResult;
}

export function evaluateNotes(
  notes: AnalystNote[],
  candles: Partial<Record<CallAsset, Candle[]>>,
  today: string,
): EvaluatedCall[] {
  return notes.flatMap((note) => note.calls.map((call) => ({ call, note, result: evaluateCall(call, note.published, candles, today) })));
}

export interface TrackRecord {
  hit: number;
  miss: number;
  void: number;
  pending: number;
}

export function trackRecord(calls: EvaluatedCall[]): TrackRecord {
  const r: TrackRecord = { hit: 0, miss: 0, void: 0, pending: 0 };
  for (const c of calls) r[c.result.status]++;
  return r;
}

/** 價格預測還差多少到目標（例如還要再跌 1.4%）；已經不在等待中就是 null */
export function distanceToTarget(call: PriceCall, r: CallResult): { level: number; pct: number; label: string } | null {
  if (r.status !== 'pending' || !r.last) return null;
  const waitingTrigger = call.trigger !== undefined && !r.triggeredOn;
  const level = waitingTrigger ? call.trigger! : call.target;
  return { level, pct: level / r.last.price - 1, label: waitingTrigger ? '條件價位' : '目標' };
}
