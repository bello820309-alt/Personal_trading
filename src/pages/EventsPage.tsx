import { useMemo, useState } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { BacktestTabs } from '../components/BacktestTabs';
import { EventLegend } from '../components/EventLegend';
import { PriceChart } from '../components/chart/PriceChart';
import { buildEventMarkers, fedRateIndicator } from '../components/chart/eventMarkers';
import { Card, Notice, PageTitle } from '../components/ui';
import { getAsset, type AssetConfig } from '../config/assets';
import {
  WINDOWS,
  WINDOW_LABELS,
  baselineStats,
  eventRows,
  groupStats,
  rankByRegime,
  rowsByGroup,
  summarizeEventGroup,
  summarizeRegimes,
} from '../backtest/eventStudy';
import { MIN_TRADES, prepareStrategies } from '../backtest/rank';
import { defaultCosts } from '../backtest/strategies';
import { EVENT_GROUP_LABELS, REGIME_LABELS, REGIME_RULE, UPCOMING_FOMC, eventsFor, fedUpperAt, regimeAt, type EventGroup } from '../data/events';
import { fmtDate, fmtPct, signClass } from '../data/format';
import { useAsset, useExtra } from '../data/load';
import { completedLength } from '../data/parse';
import type { AssetSeries } from '../data/types';
import { navigate, useLocation, withQuery } from '../router';

const GROUP_ORDER: EventGroup[] = ['hike', 'cut', 'hold', 'election', 'halving', 'crypto', 'macro'];

export function EventsPage() {
  const { query } = useLocation();
  const asset = getAsset(query.get('asset')) ?? getAsset('BTC')!;
  const state = useAsset(asset.id);
  const group = query.get('group') as EventGroup | null;
  const go = (patch: Record<string, string | null>) =>
    navigate(withQuery('/backtest/events', { asset: asset.id, group, ...patch }), { replace: true });

  return (
    <div>
      <PageTitle sub="把聯準會利率決策（FOMC）、美國選舉、比特幣減半等大事放到價格上：事件前後通常怎麼走？不同的利率環境下，哪些策略比較好用？">回測</PageTitle>
      <BacktestTabs active="events" assetId={asset.id} />
      <div className="mb-4">
        <AssetTabs value={asset.id} onChange={(id) => go({ asset: id })} />
      </div>
      {state.status === 'ready' ? (
        <EventsView key={asset.id} asset={asset} series={state.data} group={group} onGroup={(g) => go({ group: g })} />
      ) : (
        <AssetStateView state={state} name={asset.name} />
      )}
    </div>
  );
}

const pctCell = (v: number | null) => <span className={signClass(v)}>{v === null ? '還沒到' : fmtPct(v)}</span>;

function EventsView({ asset, series, group, onGroup }: { asset: AssetConfig; series: AssetSeries; group: EventGroup | null; onGroup: (g: EventGroup) => void }) {
  const n = completedLength(series);
  const lastTime = series.candles[n - 1]?.time ?? '';
  const extra = useExtra(asset.id);
  // 只用已收盤的 K 棒；收盤資料有變才重算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prep = useMemo(() => prepareStrategies(series, asset, { extra }), [asset, n, lastTime, extra]);
  const cfg = useMemo(() => defaultCosts(asset), [asset]);
  const events = useMemo(() => eventsFor(asset.id), [asset.id]);
  const rows = useMemo(() => eventRows(prep.candles, events), [prep, events]);
  const byGroup = useMemo(() => rowsByGroup(rows), [rows]);
  const baseline = useMemo(() => baselineStats(prep.candles), [prep]);
  const regimes = useMemo(() => rankByRegime(prep, cfg), [prep, cfg]);
  const [showHolds, setShowHolds] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const marks = useMemo(() => buildEventMarkers(prep.candles, events, { includeHolds: showHolds }), [prep, events, showHolds]);
  const panes = useMemo(() => [fedRateIndicator(prep.candles)], [prep]);

  const groups = GROUP_ORDER.filter((g) => byGroup.has(g));
  const active = group && groups.includes(group) ? group : groups[0]!;
  const activeRows = byGroup.get(active) ?? [];
  const stats = groupStats(activeRows);
  const lines = summarizeEventGroup(EVENT_GROUP_LABELS[active], stats, baseline, asset.name, active);
  const recent = [...activeRows].reverse();
  const shown = showAll ? recent : recent.slice(0, 12);
  const upcoming = UPCOMING_FOMC.filter((d) => d > lastTime);
  // 人工整理的大事清單：寫出收錄到哪一天，讓人知道這不是即時新聞
  const manualLatest = active === 'crypto' || active === 'macro' ? activeRows[activeRows.length - 1]?.event.date : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-semibold text-fg">價格、聯準會利率與大事</h2>
        <p className="mt-0.5 mb-3 text-xs leading-relaxed text-muted">
          K 線上方的圓點是事件，手指按住（或滑鼠移到）那根 K 棒，圖表上方會寫出是什麼事。下方的階梯線是聯準會的利率（區間上限），目前 {fedUpperAt(lastTime).toFixed(2)}%
          {upcoming.length ? `；下一次 FOMC 會議在 ${fmtDate(upcoming[0])}` : ''}。
        </p>
        <PriceChart
          candles={prep.candles}
          asset={asset}
          indicators={panes}
          eventMarkers={marks.markers}
          eventNotes={marks.notes}
          visibleBars={Math.min(prep.candles.length, 1100)}
          rangeKey={`events|${asset.id}`}
        />
        <div className="mt-2 space-y-1.5">
          <EventLegend groups={groups.filter((g) => g !== 'hold' || showHolds)} />
          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showHolds} onChange={(e) => setShowHolds(e.target.checked)} />
            也標出「利率不變」的 FOMC 會議（比較多，預設不畫）
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-fg">事件前後的表現</h2>
        <p className="mt-0.5 mb-3 text-xs leading-relaxed text-muted">
          都從「事件前一天的收盤價」算起；「事件後 1 天」算到事件隔天（日曆天）的收盤，包含事件當天的反應。日期用各市場自己的日期：例如聯準會在美國下午公布（台灣時間隔天凌晨），0050 的反應會出現在台灣隔天的收盤裡，也算在「事件後 1 天」之內。最右邊兩欄是對照組：把每一天都當成事件日，看平常的日子會怎麼走。
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const on = g === active;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setShowAll(false);
                  onGroup(g);
                }}
                className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${on ? 'border-accent bg-accent font-medium text-accent-contrast' : 'border-line bg-surface text-fg hover:bg-surface-2'}`}
              >
                {EVENT_GROUP_LABELS[g]}（{byGroup.get(g)!.length}）
              </button>
            );
          })}
        </div>
        <ul className="mb-3 space-y-1.5 text-sm leading-relaxed text-fg">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {manualLatest && (
          <p className="mb-3 text-xs leading-relaxed text-muted">
            「{EVENT_GROUP_LABELS[active]}」是人工整理的清單，只收對整個市場影響很大的事件（例如大型交易所倒閉、ETF 通過），可能比新聞慢，不是即時更新；目前最新一筆是 {fmtDate(manualLatest)}。想知道最近有沒有大事，還是要看新聞。
          </p>
        )}
        <div className="table-scroll">
          <table className="w-full min-w-[520px] text-sm tabular">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal" />
                <th className="py-1 pr-2 text-right font-normal">平均</th>
                <th className="py-1 pr-2 text-right font-normal">中位數</th>
                <th className="py-1 pr-2 text-right font-normal">上漲比例</th>
                <th className="py-1 pr-2 text-right font-normal">平常：平均</th>
                <th className="py-1 text-right font-normal">平常：上漲比例</th>
              </tr>
            </thead>
            <tbody>
              {WINDOWS.map((w) => (
                <tr key={w} className="border-t border-line">
                  <td className="py-1.5 pr-2 text-fg">
                    {WINDOW_LABELS[w]}
                    <span className="ml-1 text-xs text-muted">（{stats[w].n} 次）</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right">{pctCell(stats[w].avg)}</td>
                  <td className="py-1.5 pr-2 text-right">{pctCell(stats[w].median)}</td>
                  <td className="py-1.5 pr-2 text-right text-fg">{fmtPct(stats[w].upRatio, 0, false)}</td>
                  <td className="py-1.5 pr-2 text-right text-muted">{fmtPct(baseline[w].avg)}</td>
                  <td className="py-1.5 text-right text-muted">{fmtPct(baseline[w].upRatio, 0, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-5 mb-2 text-sm font-semibold text-fg">每一次的結果（最新在上）</h3>
        <div className="table-scroll">
          <table className="w-full min-w-[620px] text-sm tabular">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal">日期</th>
                <th className="py-1 pr-2 font-normal">事件</th>
                {WINDOWS.map((w) => (
                  <th key={w} className="py-1 pr-2 text-right font-normal last:pr-0">
                    {WINDOW_LABELS[w].replace('事件', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.event.date}|${r.event.title}`} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2 whitespace-nowrap text-fg">{fmtDate(r.event.date)}</td>
                  <td className="py-1.5 pr-2 text-fg">
                    {r.event.title}
                    {r.event.detail && <div className="text-xs text-muted">{r.event.detail}</div>}
                  </td>
                  {WINDOWS.map((w) => (
                    <td key={w} className="py-1.5 pr-2 text-right last:pr-0">
                      {pctCell(r.returns[w])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recent.length > 12 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm text-accent">
            {showAll ? '收起' : `顯示全部 ${recent.length} 次`}
          </button>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-fg">不同的利率環境下，哪個策略勝率最高？</h2>
        <p className="mt-0.5 mb-3 text-xs leading-relaxed text-muted">
          {REGIME_RULE}用全部資料回測每個策略，每筆交易依「買進那天」屬於哪一種環境歸類；完成 {MIN_TRADES} 筆以上交易的策略才排名。
          這裡只比勝率，勝率高不代表賺得多（見基礎觀念「回測是什麼？」）；交易只有 5～10 筆時，多輸一次勝率就差很多。
        </p>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          「一直抱著的年化報酬」是把整段升息期（或降息期）加起來算的長期報酬，和上面「升息後 30 天」只看每次升息之後短短 30 天的反應不一樣。例如 2017 年聯準會一路升息，股市和比特幣那一年卻都大漲。所以「升息後 30 天的平均」和「升息期一直抱著的報酬」就算看起來方向相反，也可以同時成立，並不矛盾。對定投的人：利率環境不會改變定投的規則（定投本來就不猜時機），這些資訊比較適合拿來了解最近的市場為什麼比較動盪，或給想抓買賣時機的人參考。
        </p>
        <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg">
          照這個規則，現在（{fmtDate(new Date().toISOString().slice(0, 10))}）屬於「{REGIME_LABELS[regimeAt(new Date().toISOString().slice(0, 10))]}」。
        </p>
        <ul className="mb-4 space-y-1.5 text-sm leading-relaxed text-fg">
          {summarizeRegimes(regimes).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="grid gap-3 md:grid-cols-3">
          {regimes.map((r) => {
            const ranked = r.rows.filter((x) => x.trades >= MIN_TRADES);
            return (
              <div key={r.regime} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-fg">{REGIME_LABELS[r.regime]}</h3>
                  <span className="text-xs text-muted">占 {fmtPct(r.share, 0, false)} 的時間</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  一直抱著的年化報酬：<span className={signClass(r.holdAnnualized)}>{fmtPct(r.holdAnnualized)}</span>
                </p>
                {ranked.length ? (
                  <ol className="mt-2 space-y-1 text-sm">
                    {ranked.slice(0, 5).map((x, i) => (
                      <li key={x.def.id} className="flex items-baseline gap-2">
                        <span className={`w-4 shrink-0 text-xs font-bold tabular ${i === 0 ? 'text-hot' : 'text-muted'}`}>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-fg">{x.def.name}</span>
                        <span className="shrink-0 text-xs text-muted tabular">
                          {fmtPct(x.winRate, 0, false)}・{x.trades} 筆
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-muted">沒有策略在這種環境下完成 {MIN_TRADES} 筆以上的交易。</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Notice>
        <strong className="font-semibold">看事件統計要注意：</strong>
        事件日期以美國時間為準；FOMC 的決策日期與利率取自聯準會官網，其他事件取自公開新聞報導。同一種消息，每次的背景都不一樣（例如市場是否早就預期到），所以「過去平均」不代表下一次也會這樣；兩件事剛好一起發生，也不代表一件造成另一件。
      </Notice>
    </div>
  );
}
