import { fmtNum, fmtPct } from '../data/format';
import { shortDay } from '../lab/time';
import { distanceToTarget, type CallResult } from './evaluate';
import type { AnalystCall, CallAsset, PriceCall, Stance } from './types';

const UNIT: Record<CallAsset, string> = { '0050': '元', VOO: '美元', BTC: '美元' };

export const ASSET_NAMES: Record<CallAsset, string> = { '0050': '0050', VOO: 'VOO', BTC: '比特幣' };

export const STANCE_LABELS: Record<Stance, string> = { bullish: '偏多', bearish: '偏空', neutral: '中性', mixed: '有好有壞' };

export function priceOf(asset: CallAsset, v: number): string {
  return `${fmtNum(v, v >= 1000 ? 0 : 2)} ${UNIT[asset]}`;
}

/** 2026-12-31 → 12/31（四）；不是 year 那一年的加上年份 */
export function dayText(date: string, year: number): string {
  const y = Number(date.slice(0, 4));
  return `${y === year ? '' : `${y}/`}${shortDay(date)}`;
}

/** 2026-12-31 → 12/31（放在括號裡用，不加星期） */
export function mdText(date: string, year: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y === year ? '' : `${y}/`}${m}/${d}`;
}

const words = (c: PriceCall) =>
  c.direction === 'down'
    ? { move: '跌', edge: '最低價', beyond: '以下', cross: '跌破' }
    : { move: '漲', edge: '最高價', beyond: '以上', cross: '漲破' };

/** 怎麼判斷這個價格預測說對了沒 */
export function ruleText(c: PriceCall): string {
  const w = words(c);
  const reach = `${w.edge}${w.move}到 ${priceOf(c.asset, c.target)}${w.beyond}`;
  if (c.trigger === undefined) return `期限內任何一天的${reach}，就算說對。`;
  const cross = `${w.cross} ${priceOf(c.asset, c.trigger)}`;
  return `要先${cross}；之後在期限內${reach}，就算說對。到期都沒有${cross}，就是「條件沒發生」，不算對也不算錯。`;
}

/** 目前的進度或結果（一兩句） */
export function progressText(call: AnalystCall, r: CallResult, year: number): string {
  if (call.kind === 'event') {
    if (r.status !== 'pending') return call.resolution ?? '';
    return r.overdue ? '已經過了期限，等主持人確認實際的結果。' : `${dayText(call.by, year)}之後確認。`;
  }
  const w = words(call);
  const p = (v: number) => priceOf(call.asset, v);
  const day = (d: string) => dayText(d, year);
  const md = (d: string) => mdText(d, year);
  const far = r.extreme ? `到期前${w.edge}只${w.move}到 ${p(r.extreme.price)}（${md(r.extreme.date)}）` : '到期前沒有新的資料';
  const trig = call.trigger !== undefined ? p(call.trigger) : '';
  switch (r.status) {
    case 'hit':
      if (call.trigger === undefined) return `${day(r.hitOn!)}的${w.edge}${w.move}到 ${p(call.target)}${w.beyond}，說對了。`;
      if (r.triggeredOn === r.hitOn) return `${day(r.hitOn!)}一天內${w.cross} ${trig}、又${w.move}到 ${p(call.target)}${w.beyond}，說對了。`;
      return `${day(r.triggeredOn!)}${w.cross} ${trig}，${day(r.hitOn!)}${w.move}到 ${p(call.target)}${w.beyond}，說對了。`;
    case 'miss':
      return `${r.triggeredOn ? `${day(r.triggeredOn)}${w.cross}了 ${trig}，但` : ''}${far}，沒有${w.move}到 ${p(call.target)}。`;
    case 'void':
      return `${far}，沒有${w.cross} ${trig}，條件沒發生。`;
    case 'pending': {
      const parts: string[] = [];
      if (r.triggeredOn) parts.push(`${day(r.triggeredOn)}已經${w.cross} ${trig}（條件成立），現在等它${w.move}到 ${p(call.target)}。`);
      const d = distanceToTarget(call, r);
      if (d && r.last) {
        const passed = call.direction === 'down' ? d.pct >= 0 : d.pct <= 0;
        parts.push(
          passed
            ? `${day(r.last.date)}收盤 ${p(r.last.price)}，已經在${d.label} ${p(d.level)}${w.beyond}，但影片上傳當天和之前的 K 棒不算，從下一根開始算。`
            : `${day(r.last.date)}收盤 ${p(r.last.price)}，離${d.label} ${p(d.level)}還要再${w.move} ${fmtPct(Math.abs(d.pct), 1, false)}。`,
        );
      }
      parts.push(r.extreme ? `影片上傳後${w.edge}${w.move}到 ${p(r.extreme.price)}（${md(r.extreme.date)}）。` : '影片上傳之後還沒有新的收盤資料。');
      return parts.join('');
    }
  }
}
