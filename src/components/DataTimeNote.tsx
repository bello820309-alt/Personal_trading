import { fmtClock, fmtDate, fmtDateTime } from '../data/format';
import type { AssetSeries } from '../data/types';

/**
 * 「這個價格是幾點的」：
 * - 比特幣：即時（幣安）＋最近一次更新時間；抓不到時清楚說明現在顯示的是哪個時間的資料。
 * - 股票：最近一個收盤日。
 */
export function DataTimeNote({ series, compact }: { series: AssetSeries; compact?: boolean }) {
  const live = series.live;
  const last = series.candles[series.candles.length - 1];
  if (live) {
    if (live.fetchedAt && !live.error) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="text-fg">即時</span>
          <span>
            {live.source}・{fmtClock(live.fetchedAt)} 更新{compact ? '' : '（每分鐘自動更新）'}
          </span>
        </span>
      );
    }
    if (!live.fetchedAt && !live.error) {
      return <span>正在向{live.source}取得即時價格…</span>;
    }
    const asOf = live.fetchedAt ? fmtClock(live.fetchedAt) : fmtDateTime(series.meta.updatedAt);
    return (
      <span className="text-hot">
        即時報價暫時無法取得（{live.error}），目前顯示 {asOf} 的資料{compact ? '' : '，會每分鐘自動重試'}
      </span>
    );
  }
  if (!last) return null;
  return (
    <span>
      {fmtDate(last.time)} 收盤{series.meta.lastBarComplete ? '' : '（尚未收盤）'}
      {compact ? '' : '・每天收盤後更新'}
    </span>
  );
}
