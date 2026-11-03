import { EVENT_GROUP_LABELS, EVENT_GROUP_MARK, type EventGroup } from '../data/events';
import { useResolvedTheme, useSettings } from '../store/settings';
import { getChartTheme } from '../theme';
import { resolveColor } from './chart/PriceChart';
import { EVENT_GROUP_COLOR } from './chart/eventMarkers';

/** 圖上事件標記的說明：哪個字、哪個顏色代表什麼 */
export function EventLegend({ groups, note }: { groups: EventGroup[]; note?: string }) {
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const t = getChartTheme(theme, colorMode);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {groups.map((g) => (
        <span key={g} className="inline-flex items-center gap-1">
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: resolveColor(t, EVENT_GROUP_COLOR[g]) }}
          >
            {EVENT_GROUP_MARK[g]}
          </span>
          {EVENT_GROUP_LABELS[g]}
        </span>
      ))}
      {note && <span>{note}</span>}
    </div>
  );
}
