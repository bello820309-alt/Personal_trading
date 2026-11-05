import { useMemo, type ReactNode } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { BacktestTabs } from '../components/BacktestTabs';
import { PeriodPicker } from '../components/PeriodPicker';
import { Card, Notice, PageTitle, Segmented } from '../components/ui';
import { getAsset, type AssetConfig } from '../config/assets';
import {
  MIN_TRADES,
  RANK_SORT_LABELS,
  adjacentCheck,
  prepareStrategies,
  runRanking,
  sortRows,
  splitBySample,
  yearlyChampions,
  type RankResult,
  type RankRow,
  type RankSort,
} from '../backtest/rank';
import { buildPresets, type PeriodPreset } from '../backtest/rankPeriods';
import { summarizeAdjacent, summarizeRanking, summarizeYearly } from '../backtest/rankSummary';
import { defaultCosts } from '../backtest/strategies';
import { eventRows, regimeShares } from '../backtest/eventStudy';
import { REGIME_LABELS, eventsFor, fedUpperAt, type Regime } from '../data/events';
import { daysBetween, fmtDate, fmtNum, fmtPct, signClass } from '../data/format';
import { useAsset, useExtra } from '../data/load';
import { completedLength } from '../data/parse';
import { indexRange, isIsoDate } from '../data/range';
import type { AssetSeries, Candle } from '../data/types';
import { Link, navigate, useLocation, withQuery } from '../router';

const SORTS: RankSort[] = ['winRate', 'return', 'drawdown', 'trades'];

type Go = (patch: Record<string, string | null | undefined>) => void;

export function RankPage() {
  const { query } = useLocation();
  // 這個功能先以比特幣為主，沒有指定標的時預設比特幣
  const asset = getAsset(query.get('asset')) ?? getAsset('BTC')!;
  const state = useAsset(asset.id);
  const sortQ = query.get('sort') ?? '';
  const sort: RankSort = (SORTS as string[]).includes(sortQ) ? (sortQ as RankSort) : 'winRate';
  const p = query.get('p');
  const from = query.get('from');
  const to = query.get('to');

  const go: Go = (patch) =>
    navigate(withQuery('/backtest/rank', { asset: asset.id, p, from, to, sort: sort === 'winRate' ? null : sort, ...patch }), { replace: true });

  return (
    <div>
      <PageTitle sub="選一段期間，把每個指標的經典買賣規則都回測一次：哪個勝率最高、哪個最賺錢，以及「冠軍」換到別段期間還靈不靈。">
        回測
      </PageTitle>
      <BacktestTabs active="rank" assetId={asset.id} />
      <div className="mb-4">
        <AssetTabs value={asset.id} onChange={(id) => go({ asset: id, p: null, from: null, to: null })} />
      </div>
      {state.status === 'ready' ? (
        <RankView key={asset.id} asset={asset} series={state.data} presetKey={p} from={from} to={to} sort={sort} go={go} />
      ) : (
        <AssetStateView state={state} name={asset.name} />
      )}
    </div>
  );
}

const excess = (r: RankRow, hold: number) => r.totalReturn - hold;

function RankItem({
  rank,
  row,
  hold,
  badges,
  href,
}: {
  rank: number | null;
  row: RankRow;
  hold: number;
  badges: string[];
  href: string;
}) {
  return (
    <li className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 w-6 shrink-0 text-center text-sm font-bold tabular ${rank === 1 ? 'text-hot' : 'text-muted'}`}>{rank ?? '—'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link to={href} className="font-medium text-fg underline decoration-dotted underline-offset-4">
              {row.def.name}
            </Link>
            <span className="text-xs text-muted">{row.def.strategy?.name}</span>
            {badges.map((b) => (
              <span key={b} className="rounded bg-hot/15 px-1.5 py-0.5 text-[11px] font-medium text-hot">
                {b}
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((row.winRate ?? 0) * 100)}%` }} />
            </div>
            <span className="shrink-0 text-xs text-fg tabular">勝率 {fmtPct(row.winRate, 0, false)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted tabular">
            <span>
              {row.trades === 0 && !row.holding
                ? '0 筆（這段期間沒有出現買進訊號，一直拿著現金）'
                : `${row.trades} 筆（賺 ${row.wins}、賠 ${row.trades - row.wins}）${row.holding ? '＋1 筆還沒賣出' : ''}`}
            </span>
            <span>
              總報酬 <span className={signClass(row.totalReturn)}>{fmtPct(row.totalReturn)}</span>
            </span>
            <span>
              超額報酬 <span className={signClass(excess(row, hold))}>{fmtPct(excess(row, hold))}</span>
            </span>
            <span>最大回撤 −{fmtNum(row.maxDrawdown * 100, 1)}%</span>
            {row.holding && <span className="text-hot">期末仍持有：交易筆數只算已經賣出的，總報酬有算進這筆還沒賣的</span>}
          </div>
        </div>
      </div>
    </li>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed text-fg">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function H2({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-fg">{children}</h2>
      {sub && <p className="mt-0.5 text-xs leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

function RankView({
  asset,
  series,
  presetKey,
  from,
  to,
  sort,
  go,
}: {
  asset: AssetConfig;
  series: AssetSeries;
  presetKey: string | null;
  from: string | null;
  to: string | null;
  sort: RankSort;
  go: Go;
}) {
  const n = completedLength(series);
  const lastTime = series.candles[n - 1]?.time ?? '';
  // 比特幣專屬的策略（情緒、合約、鏈上）要等額外資料載入後才加入排行
  const extra = useExtra(asset.id);
  // 比特幣網頁開著時每分鐘更新即時價格，但排行只用已收盤的 K 棒：收盤資料有變才重算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prep = useMemo(() => prepareStrategies(series, asset, { extra }), [asset, n, lastTime, extra]);
  const cfg = useMemo(() => defaultCosts(asset), [asset]);
  const presets = useMemo(() => buildPresets(prep.candles, asset.id), [prep, asset.id]);
  const first = prep.candles[0]?.time ?? '';
  const last = prep.candles[prep.candles.length - 1]?.time ?? '';

  const preset = presets.find((x) => x.key === presetKey);
  const custom = !preset && isIsoDate(from) && isIsoDate(to) && from <= to ? { key: 'custom', from, to } : null;
  const active = preset ?? custom ?? presets.find((x) => x.key === '1Y') ?? presets[0]!;
  const range = indexRange(prep.candles, active.from, active.to);
  const rs = range?.start ?? -1;
  const re = range?.end ?? -1;

  const result = useMemo(() => (rs >= 0 ? runRanking(prep, rs, re, cfg) : null), [prep, cfg, rs, re]);
  const adjacent = useMemo(() => (result ? adjacentCheck(prep, rs, re, cfg, result) : null), [prep, cfg, result, rs, re]);
  const yearly = useMemo(() => yearlyChampions(prep, cfg), [prep, cfg]);

  const pick = (p: PeriodPreset) => go({ p: p.key, from: null, to: null });
  const setCustom = (f: string, t: string) => {
    if (isIsoDate(f) && isIsoDate(t)) go({ p: 'custom', from: f <= t ? f : t, to: f <= t ? t : f });
  };

  return (
    <div className="space-y-4">
      <Card>
        <H2>選擇期間</H2>
        <div className="space-y-3">
          <PeriodPicker
            presets={presets}
            activeKey={active.key}
            from={active.from}
            to={active.to}
            first={first}
            last={last}
            onPick={pick}
            onCustom={setCustom}
          />
          {range ? (
            <p className="text-xs text-muted">
              實際回測：{fmtDate(prep.candles[rs]!.time)}～{fmtDate(prep.candles[re]!.time)}（{daysBetween(prep.candles[rs]!.time, prep.candles[re]!.time)} 天、
              {re - rs + 1} 根日 K）。資料範圍：{fmtDate(first)}～{fmtDate(last)}。
            </p>
          ) : (
            <p className="text-sm text-hot">這段期間沒有資料，請換一段期間（資料範圍：{fmtDate(first)}～{fmtDate(last)}）。</p>
          )}
        </div>
      </Card>

      {result && <RankResults asset={asset} candles={prep.candles} result={result} sort={sort} go={go} />}

      {result && <PeriodNews asset={asset} candles={prep.candles} start={rs} end={re} />}

      {result && (
        <Card>
          <H2 sub="事後挑出的冠軍，換到另一段期間不一定還是冠軍。這裡用相鄰、同樣長度的期間實際檢驗一次。">冠軍換一段期間還有效嗎？</H2>
          {adjacent ? (
            <>
              <Lines lines={summarizeAdjacent(adjacent, prep.candles)} />
              <div className="table-scroll mt-3">
                <table className="w-full min-w-[460px] text-sm tabular">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1 pr-2 font-normal">{adjacent.champion.def.name}</th>
                      <th className="py-1 pr-2 text-right font-normal">勝率</th>
                      <th className="py-1 pr-2 text-right font-normal">交易</th>
                      <th className="py-1 pr-2 text-right font-normal">總報酬</th>
                      <th className="py-1 text-right font-normal">勝率排名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: adjacent.direction === 'next' ? '這段期間' : '上一段期間', res: adjacent.base, row: adjacent.champion, rank: '1' },
                      {
                        label: adjacent.direction === 'next' ? '下一段期間' : '這段期間',
                        res: adjacent.other,
                        row: adjacent.otherRow,
                        rank: adjacent.otherRank === null ? '不足 5 筆' : `${adjacent.otherRank} / ${adjacent.otherRankedCount}`,
                      },
                    ].map((x) => (
                      <tr key={x.label} className="border-t border-line">
                        <td className="py-1.5 pr-2 text-fg">
                          {x.label}
                          <div className="text-xs text-muted">
                            {fmtDate(prep.candles[x.res.start]!.time)}～{fmtDate(prep.candles[x.res.end]!.time)}
                          </div>
                        </td>
                        <td className="py-1.5 pr-2 text-right text-fg">{fmtPct(x.row.winRate, 0, false)}</td>
                        <td className="py-1.5 pr-2 text-right text-muted">{x.row.trades} 筆</td>
                        <td className={`py-1.5 pr-2 text-right ${signClass(x.row.totalReturn)}`}>{fmtPct(x.row.totalReturn)}</td>
                        <td className="py-1.5 text-right text-fg">{x.rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">選的期間前後都沒有足夠的資料可以比較，或這段期間沒有任何策略完成 {MIN_TRADES} 筆以上的交易。</p>
          )}
        </Card>
      )}

      <Card>
        <H2 sub="每個完整年度都挑出勝率冠軍，再看它隔年的名次。這個表和上面選的期間無關，用的是全部資料。">每年的勝率冠軍，隔年還是冠軍嗎？</H2>
        <Lines lines={summarizeYearly(yearly)} />
        {yearly.length > 0 && (
          <div className="table-scroll mt-3">
            <table className="w-full min-w-[480px] text-sm tabular">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 pr-2 font-normal">年份</th>
                  <th className="py-1 pr-2 font-normal">當年勝率冠軍</th>
                  <th className="py-1 pr-2 text-right font-normal">當年勝率</th>
                  <th className="py-1 pr-2 text-right font-normal">隔年勝率</th>
                  <th className="py-1 text-right font-normal">隔年排名</th>
                </tr>
              </thead>
              <tbody>
                {yearly.map((y) => (
                  <tr key={y.year} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-fg">{y.year}</td>
                    <td className="py-1.5 pr-2 text-fg">{y.champion.def.name}</td>
                    <td className="py-1.5 pr-2 text-right text-fg">
                      {fmtPct(y.champion.winRate, 0, false)} <span className="text-xs text-muted">（{y.champion.trades} 筆）</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-fg">
                      {fmtPct(y.next.winRate, 0, false)} <span className="text-xs text-muted">（{y.next.trades} 筆）</span>
                    </td>
                    <td className={`py-1.5 text-right ${y.nextRank !== null && y.nextRank <= 3 ? 'text-up' : 'text-fg'}`}>
                      {y.nextRank === null ? '不足 5 筆' : `${y.nextRank} / ${y.nextRankedCount}`}
                      {y.nextPartial && <div className="text-[11px] text-muted">{y.nextYear} 年至今</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Notice>
        <strong className="font-semibold">怎麼用這個排行榜：</strong>
        它告訴你「過去這段期間」哪些規則表現好，幫助你理解不同指標適合什麼行情；它不能告訴你明天該用哪一個。勝率高不代表賺錢，交易次數少的結果很可能只是運氣。
        <Link to="/basics/backtest" className="ml-1 text-accent">
          了解回測的陷阱
        </Link>
      </Notice>
    </div>
  );
}

const REGIME_ORDER: Regime[] = ['hiking', 'cutting', 'steady'];

/** 這段期間發生了哪些大事、處在什麼利率環境 */
function PeriodNews({ asset, candles, start, end }: { asset: AssetConfig; candles: Candle[]; start: number; end: number }) {
  const events = useMemo(() => eventsFor(asset.id), [asset.id]);
  const from = candles[start]!.time;
  const to = candles[end]!.time;
  const rows = useMemo(() => eventRows(candles, events).filter((r) => r.event.date >= from && r.event.date <= to), [candles, events, from, to]);
  const shares = useMemo(() => regimeShares(candles, start, end), [candles, start, end]);
  const notable = rows.filter((r) => r.event.group !== 'hold');
  const holds = rows.length - notable.length;
  const rateFrom = fedUpperAt(from);
  const rateTo = fedUpperAt(to);
  return (
    <Card>
      <H2 sub="這段期間發生了哪些大事、處在什麼利率環境，可以對照上面的排行一起看。">這段期間的消息面</H2>
      <p className="text-sm leading-relaxed text-fg">
        利率環境：
        {REGIME_ORDER.filter((r) => shares[r] > 0.005)
          .map((r) => `${REGIME_LABELS[r]} ${fmtPct(shares[r], 0, false)}`)
          .join('、')}
        ；聯準會利率上限
        {rateFrom === rateTo ? `維持 ${rateTo.toFixed(2)}%` : `從 ${rateFrom.toFixed(2)}% 變成 ${rateTo.toFixed(2)}%`}。
      </p>
      {notable.length ? (
        <ul className="mt-3 space-y-1.5">
          {[...notable]
            .reverse()
            .slice(0, 15)
            .map((r) => (
              <li key={`${r.event.date}|${r.event.title}`} className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 text-xs text-muted tabular">{fmtDate(r.event.date)}</span>
                <span className="min-w-0 flex-1 text-fg">{r.event.title}</span>
                <span className="shrink-0 text-xs text-muted tabular">
                  後 7 天 <span className={signClass(r.returns.after7)}>{r.returns.after7 === null ? '還沒到' : fmtPct(r.returns.after7)}</span>
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">這段期間沒有清單裡的大事。</p>
      )}
      {holds > 0 && <p className="mt-2 text-xs text-muted">另外還開了 {holds} 次利率不變的 FOMC 會議。</p>}
      <Link to={withQuery('/backtest/events', { asset: asset.id })} className="mt-3 inline-block text-sm text-accent">
        看所有事件前後的統計，以及不同利率環境下的策略勝率 →
      </Link>
    </Card>
  );
}

function RankResults({ asset, candles, result, sort, go }: { asset: AssetConfig; candles: Candle[]; result: RankResult; sort: RankSort; go: Go }) {
  const lines = useMemo(() => summarizeRanking(result, candles, asset), [result, candles, asset]);
  const { ranked, lowSample } = splitBySample(result.rows);
  const sorted = sortRows(ranked, sort);
  const topWin = sortRows(ranked, 'winRate')[0]?.def.id;
  const topReturn = sortRows(ranked, 'return')[0]?.def.id;
  const hold = result.benchmark.totalReturn;
  const from = candles[result.start]!.time;
  const to = candles[result.end]!.time;
  const href = (id: string) => withQuery('/backtest', { asset: asset.id, strategy: id, from, to });
  const badges = (r: RankRow) => [...(r.def.id === topWin ? ['勝率最高'] : []), ...(r.def.id === topReturn ? ['總報酬最高'] : [])];

  return (
    <>
      <Card>
        <H2>白話結論</H2>
        <Lines lines={lines} />
        <p className="mt-3 text-xs leading-relaxed text-muted">
          以上是照回測數字自動寫出來的，不是預測，也不是投資建議。回測用還原權息後的日 K；訊號在收盤確定、隔天開盤成交；只做多、全部資金進出，並扣除手續費
          {asset.costs.sellTaxRate > 0 ? '與交易稅' : ''}。
        </p>
      </Card>

      <Card>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-fg">排行榜</h2>
          <Segmented<RankSort>
            size="sm"
            ariaLabel="排序方式"
            value={sort}
            onChange={(v) => go({ sort: v === 'winRate' ? null : v })}
            options={SORTS.map((s) => ({ value: s, label: RANK_SORT_LABELS[s] }))}
          />
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          完成 {MIN_TRADES} 筆以上交易的策略才列入排名。超額報酬＝策略的總報酬減掉一直抱著的報酬。點策略名稱可以看完整回測（買賣點、交易明細）。
        </p>
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted tabular">
          <span className="font-medium text-fg">對照：買了一直抱著</span>
          <span>
            總報酬 <span className={signClass(hold)}>{fmtPct(hold)}</span>
          </span>
          <span>最大回撤 −{fmtNum(result.benchmark.maxDrawdown * 100, 1)}%</span>
        </div>
        {sorted.length > 0 ? (
          <ol className="space-y-2">
            {sorted.map((r, i) => (
              <RankItem key={r.def.id} rank={i + 1} row={r} hold={hold} badges={badges(r)} href={href(r.def.id)} />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">這段期間沒有任何策略完成 {MIN_TRADES} 筆以上的交易。可以把期間拉長一點。</p>
        )}
        {lowSample.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-muted">
              交易不到 {MIN_TRADES} 次（運氣成分太大，不列入排名）
            </h3>
            <ul className="space-y-2 opacity-80">
              {sortRows(lowSample, sort).map((r) => (
                <RankItem key={r.def.id} rank={null} row={r} hold={hold} badges={[]} href={href(r.def.id)} />
              ))}
            </ul>
          </div>
        )}
      </Card>
    </>
  );
}
