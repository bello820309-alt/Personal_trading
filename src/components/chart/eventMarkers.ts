import { barAtOrBefore } from '../../backtest/eventStudy';
import { fmtDate } from '../../data/format';
import { EVENT_GROUP_MARK, fedUpperAt, type EventGroup, type MarketEvent } from '../../data/events';
import type { Candle } from '../../data/types';
import type { ColorRole } from '../../indicators/types';
import type { ChartIndicator, EventMarker } from './PriceChart';

export const EVENT_GROUP_COLOR: Record<EventGroup, ColorRole> = {
  hike: 'hot',
  cut: 'cold',
  hold: 'muted',
  election: 's2',
  halving: 'accent',
  crypto: 's4',
  macro: 's5',
};

/**
 * 把事件放到 K 棒上：事件那天（週 K、月 K 是包含那天的那一根；股票遇到休市是之前最近的一根）。
 * notes 包含所有事件（十字線停在那根 K 棒時顯示）；圖上的標記預設不畫「利率不變」，避免太擠。
 */
export function buildEventMarkers(
  candles: readonly Candle[],
  events: readonly MarketEvent[],
  opts: { includeHolds?: boolean } = {},
): { markers: EventMarker[]; notes: Map<number, string[]> } {
  const markers: EventMarker[] = [];
  const notes = new Map<number, string[]>();
  if (!candles.length) return { markers, notes };
  const first = candles[0]!.time;
  const lastBar = candles[candles.length - 1]!;
  const last = lastBar.endTime ?? lastBar.time;
  const seen = new Set<string>();
  for (const e of events) {
    if (e.date < first || e.date > last) continue;
    const i = barAtOrBefore(candles, e.date);
    if (i < 0) continue;
    const list = notes.get(i) ?? [];
    list.push(`${fmtDate(e.date)} ${e.title}`);
    notes.set(i, list);
    if (e.group === 'hold' && !opts.includeHolds) continue;
    const key = `${i}|${e.group}`;
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push({ index: i, text: EVENT_GROUP_MARK[e.group], color: EVENT_GROUP_COLOR[e.group] });
  }
  return { markers, notes };
}

/** 聯準會利率（區間上限）畫成副圖的階梯線 */
export function fedRateIndicator(candles: readonly Candle[]): ChartIndicator {
  return {
    key: 'fed-rate',
    title: '聯準會利率',
    placement: 'pane',
    result: {
      lines: [{ key: 'upper', label: '區間上限', values: candles.map((c) => fedUpperAt(c.endTime ?? c.time)), kind: 'step', color: 'hot', width: 2, unit: 'percent' }],
    },
  };
}
