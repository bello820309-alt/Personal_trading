import type { Candle } from '../data/types';
import { localTime } from '../lab/time';
import type { AnalystCall, AnalystNote, CallAsset, EventCall, PriceCall } from './types';

/*
 * 分析師的預測說對了沒：用本站每天的收盤資料（只用已收盤的 K 棒）。
 *
 * - 從影片上傳那天（該市場當地日期）的「隔天」開始算：上傳當天的 K 棒有一部分是上傳之前的價格。
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

export interface PricePoint {
  price: number;
  date: string;
}

export interface CallResult {
  status: CallStatus;
  /** 從這一天開始算（市場當地日期） */
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
  const from = localTime(Date.parse(published), ASSET_TZ[call.asset]).date;
  const lastBar = candles[candles.length - 1];
  const out: CallResult = { status: 'pending', from };
  if (lastBar) out.last = { price: lastBar.close, date: lastBar.time };
  let triggered = call.trigger === undefined;
  for (const c of candles) {
    if (c.time <= from) continue;
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
