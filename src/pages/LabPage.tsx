import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LineChart, type LineSpec } from '../components/chart/LineChart';
import { Card, Fold, Notice, PageTitle, Segmented, Spinner } from '../components/ui';
import { getAsset, type AssetConfig } from '../config/assets';
import { fmtPct, signClass } from '../data/format';
import {
  benchmarkOrders,
  dayNumber,
  equitySeries,
  FILL_RULE,
  marketAt,
  pendingOrders,
  phaseOf,
  settleOrders,
  standing,
  type EquityPoint,
  type LabMarket,
  type Standing,
} from '../lab/engine';
import { assetName, fillText, orderText, pageLabel, priceText, twd, twdSigned, twdWan, unitsText } from '../lab/format';
import { useLab, type LabData } from '../lab/load';
import { addDays, localTime, shortDay, TAIPEI, taipeiDate } from '../lab/time';
import type { LabExperiment, LabFill, LabJournalEntry, LabOrder } from '../lab/types';
import { Link, navigate, useLocation, withQuery } from '../router';
import { useResolvedTheme, useSettings } from '../store/settings';
import { getChartTheme } from '../theme';

type Tint = 'accent' | 'hot' | 'muted';
const DOT: Record<Tint, string> = { accent: 'bg-accent', hot: 'bg-hot', muted: 'bg-muted' };
const AGENT_TINTS: Tint[] = ['accent', 'hot'];

interface Participant {
  id: string;
  name: string;
  intro: string;
  tint: Tint;
  bench: boolean;
  orders: LabOrder[];
  fills: LabFill[];
  journal: LabJournalEntry[];
  now: Standing;
  series: EquityPoint[];
}

export function LabPage() {
  const state = useLab();
  return (
    <div>
      <PageTitle sub="兩個新手 AI 只靠這個網站學技術分析，各拿虛擬的 100 萬台幣操作一個月，每天記下怎麼想、怎麼做。">
        AI 模擬交易實驗
      </PageTitle>
      {state.status === 'ready' ? (
        <LabView data={state.data} />
      ) : state.status === 'loading' ? (
        <Spinner />
      ) : (
        <Notice tone="warn">{state.message}</Notice>
      )}
    </div>
  );
}

/** 每 10 分鐘更新一次「現在」，跨過午夜時日期會跟著變 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 10 * 60 * 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const CAVEAT =
  '這是模擬，不是真的錢。AI 本來就懂一些投資知識，雖然要求它們只照網站上的內容判斷，仍可能受原本的知識影響；' +
  '而且一個月很短，成績有很大的運氣成分，不代表哪種做法比較好。這個實驗主要是看「新手照著網站學，會怎麼想、怎麼做、哪裡看不懂」。' +
  '所有內容都不構成投資建議。';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function runTimeText(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${h! < 12 ? '上午' : '下午'} ${h! > 12 ? h! - 12 : h}:${String(m).padStart(2, '0')}`;
}

function LabView({ data }: { data: LabData }) {
  const nowMs = useNow();
  const { exp } = data;
  const { query } = useLocation();
  const who = exp.agents.some((a) => a.id === query.get('who')) ? query.get('who')! : exp.agents[0]?.id ?? '';

  const view = useMemo(() => {
    const today = taipeiDate(nowMs);
    const market = marketAt(data.market, nowMs);
    const lastDay = today < exp.wrapUp ? today : exp.wrapUp;
    const started = today >= exp.start;
    const from = addDays(exp.start, -1);
    const make = (p: Omit<Participant, 'now' | 'series'>): Participant => ({
      ...p,
      now: standing(exp.capital, p.fills, market, lastDay),
      series: started ? equitySeries(exp.capital, p.fills, market, from, lastDay) : [],
    });
    const people = exp.agents.map((a, i) => {
      const file = data.agents[i]!;
      return make({
        id: a.id,
        name: a.name,
        intro: a.intro,
        tint: AGENT_TINTS[i % AGENT_TINTS.length]!,
        bench: false,
        orders: file.orders,
        fills: file.fills,
        journal: [...file.journal].sort((x, y) => (x.day < y.day ? 1 : -1)),
      });
    });
    const benchOrders = benchmarkOrders(exp);
    const bench = make({
      id: 'bench',
      name: exp.benchmark.name,
      intro: exp.benchmark.intro,
      tint: 'muted',
      bench: true,
      orders: benchOrders,
      fills: settleOrders(benchOrders, [], market, exp.capital, new Date(nowMs).toISOString()),
      journal: [],
    });
    return { today, market, people, bench };
  }, [data, exp, nowMs]);

  const selected = view.people.find((p) => p.id === who) ?? view.people[0];
  const anyFill = [...view.people, view.bench].some((p) => p.fills.some((f) => f.status === 'filled'));

  return (
    <div className="space-y-4">
      <StatusLine exp={exp} today={view.today} />
      <div className="grid gap-3 sm:grid-cols-3">
        {[...view.people, view.bench].map((p) => (
          <ScoreCard key={p.id} p={p} capital={exp.capital} nowMs={nowMs} />
        ))}
      </div>
      <Card>
        <H2 sub="每天用收盤價和匯率估算一次（含現金）。比特幣週末也會動，所以週末也有點。">總資產的變化</H2>
        {anyFill ? (
          <ValueChart people={[...view.people, view.bench]} />
        ) : (
          <p className="py-6 text-center text-sm text-muted">第一筆成交之後就會開始畫（第一天下單，隔天成交）。</p>
        )}
        <DataNote market={view.market} />
      </Card>

      {selected && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-fg">每位的操作和心得</h2>
            <Segmented
              value={selected.id}
              options={view.people.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(id) => navigate(withQuery('/lab', { who: id === view.people[0]?.id ? null : id }), { replace: true })}
              ariaLabel="選擇參加者"
            />
          </div>
          <AgentDetail key={selected.id} p={selected} exp={exp} />
        </section>
      )}

      <Feedback people={view.people} />
      <Rules exp={exp} />
      <Notice tone="warn">{CAVEAT}</Notice>
    </div>
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

function StatusLine({ exp, today }: { exp: LabExperiment; today: string }) {
  const phase = phaseOf(exp, today);
  const total = dayNumber(exp, exp.end);
  const when = `每天台灣時間${runTimeText(exp.runTime)} 左右操作一次`;
  let text: ReactNode;
  if (phase === 'before') text = <>實驗還沒開始：第一天是 <b className="text-fg">{shortDay(exp.start)}</b>，{when}，共 {total} 天。</>;
  else if (phase === 'running')
    text = (
      <>
        <b className="text-fg">第 {dayNumber(exp, today)} 天</b>／共 {total} 天（{md(exp.start)}～{md(exp.end)}）・{when}，下單後隔天成交
      </>
    );
  else if (phase === 'wrapup') text = <>今天是結算日：不再下單，兩位寫下最後的心得。</>;
  else text = <>實驗已經結束（{md(exp.start)}～{md(exp.end)}），下面是最後的成績。</>;
  return <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{text}</p>;
}

function ScoreCard({ p, capital, nowMs }: { p: Participant; capital: number; nowMs: number }) {
  const ret = p.now.returnPct;
  const cashPct = p.now.value > 0 ? p.now.cash / p.now.value : 1;
  // 對照組的單是「第一天」才下，開始前不算
  const pending = pendingOrders(p.orders, p.fills).filter((o) => Date.parse(o.placedAt) <= nowMs).length;
  return (
    <Card className={p.bench ? 'border-dashed' : ''}>
      <div className="flex items-center gap-2 text-sm">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[p.tint]}`} />
        <span className="font-semibold text-fg">{p.name}</span>
        {p.bench && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">對照</span>}
      </div>
      <div className="mt-2 text-2xl font-bold tabular text-fg">{twd(p.now.value)}</div>
      <div className={`text-sm tabular ${signClass(ret)}`}>
        {fmtPct(ret)}
        <span className="ml-1 text-muted">（{twdSigned(p.now.value - capital)}）</span>
      </div>
      <div className="mt-2 text-xs text-muted">
        現金 {fmtPct(cashPct, 0, false)}・成交 {p.now.state.trades} 筆{pending > 0 ? `・待成交 ${pending} 筆` : ''}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{p.intro}</p>
    </Card>
  );
}

function ValueChart({ people }: { people: Participant[] }) {
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const t = getChartTheme(theme, colorMode);
  const { accent, hot, textMuted } = t;
  const lines = useMemo<LineSpec[]>(() => {
    const color: Record<Tint, string> = { accent, hot, muted: textMuted };
    return people.map((p) => ({
      key: p.id,
      label: p.name,
      color: color[p.tint],
      width: p.bench ? 1 : 2,
      dashed: p.bench,
      points: p.series.map((x) => ({ time: x.time, value: Math.round(x.value) })),
    }));
  }, [people, accent, hot, textMuted]);
  return (
    <>
      <LineChart lines={lines} height={240} format={twdWan} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {lines.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4" style={{ borderTop: `${l.width ?? 2}px ${l.dashed ? 'dashed' : 'solid'} ${l.color}` }} />
            {l.label}
          </span>
        ))}
      </div>
    </>
  );
}

function DataNote({ market }: { market: LabMarket }) {
  const parts = Object.entries(market.candles)
    .filter(([, c]) => c.length > 0)
    .map(([id, c]) => `${assetName(id)} ${md(c[c.length - 1]!.time)}`);
  const fx = market.fx?.t.length ? `匯率 ${md(market.fx.t[market.fx.t.length - 1]!)}` : '';
  return <p className="mt-2 text-xs text-muted">估算用的最新收盤：{[...parts, fx].filter(Boolean).join('、')}</p>;
}

function AgentDetail({ p, exp }: { p: Participant; exp: LabExperiment }) {
  const pending = pendingOrders(p.orders, p.fills);
  const learned = p.journal.flatMap((j) => j.learned.map((x) => ({ day: j.day, text: x })));
  const confused = p.journal.flatMap((j) => j.confused.map((x) => ({ day: j.day, text: x })));
  return (
    <div className="space-y-4">
      <Card>
        <H2 sub="用最新的收盤價估算；損益已經扣掉買進的手續費。">{p.name} 現在的資產</H2>
        <Holdings p={p} />
        {pending.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 text-sm font-medium text-fg">還沒成交的單</h3>
            <ul className="space-y-1.5 text-sm">
              {pending.map((o) => (
                <li key={o.id}>
                  <span className="text-fg">{orderText(o)}</span>
                  <span className="text-muted">：會用{FILL_RULE[getAsset(o.asset)?.market ?? 'tw']}成交</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card>
        <H2 sub="最新的在最上面。每天的單會在隔天成交，成交的價格和金額也寫在當天的心得裡。">每天的心得</H2>
        <Journal p={p} exp={exp} />
      </Card>
      <Fold title={`全部的交易紀錄（${p.orders.length} 筆）`} sub="每一筆單的理由和成交結果。">
        <OrderList orders={p.orders} fills={p.fills} />
      </Fold>
      <Fold title={`學到的東西（${learned.length} 項）`} sub="每天心得裡「今天學到的」整理在一起。">
        <DayList items={learned} empty="還沒有。" />
      </Fold>
      <Fold title={`看不懂的地方（${confused.length} 項）`} sub="可以拿來改進網站的說明。">
        <DayList items={confused} empty="還沒有。" />
      </Fold>
    </div>
  );
}

function Holdings({ p }: { p: Participant }) {
  const { value, cash, holdings } = p.now.valuation;
  return (
    <ul className="divide-y divide-line text-sm">
      {holdings.map((h) => (
        <li key={h.asset.id} className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="font-medium text-fg">
              {h.asset.shortName}
              <span className="ml-1.5 font-normal text-muted">{unitsText(h.asset.id, h.units)}</span>
            </div>
            <div className="text-xs text-muted">
              平均成本 {priceText(h.asset.id, h.avgCost)}・現價 {priceText(h.asset.id, h.price)}（{md(h.priceDate)}）
            </div>
          </div>
          <div className="shrink-0 text-right tabular">
            <div className="text-fg">{twd(h.value)}</div>
            <div className={`text-xs ${signClass(h.pnl)}`}>
              {twdSigned(h.pnl)}（{fmtPct(h.pnlPct)}）
            </div>
          </div>
        </li>
      ))}
      <li className="flex items-center justify-between gap-3 py-2">
        <span className="font-medium text-fg">現金</span>
        <span className="tabular text-fg">
          {twd(cash)}
          <span className="ml-1 text-xs text-muted">（{fmtPct(value > 0 ? cash / value : 1, 0, false)}）</span>
        </span>
      </li>
    </ul>
  );
}

function fillWhen(f: LabFill): string {
  const t = localTime(Date.parse(f.at), TAIPEI);
  return `${shortDay(t.date)} ${t.hm}`;
}

function OrderLine({ o, fill }: { o: LabOrder; fill?: LabFill }) {
  let status: ReactNode;
  if (o.cancelledAt) status = <span className="text-muted">已取消</span>;
  else if (!fill) status = <span className="text-hot">等待成交</span>;
  else if (fill.status !== 'filled') status = <span className="text-hot">{fillText(fill)}</span>;
  else
    status = (
      <span className="text-muted">
        {fillWhen(fill)} {fillText(fill)}
      </span>
    );
  return (
    <div className="text-sm">
      <span className={`font-medium ${o.side === 'buy' ? 'text-up' : 'text-down'}`}>{orderText(o)}</span>
      <span className="ml-1">→ {status}</span>
      <div className="text-xs text-muted">理由：{o.reason}</div>
    </div>
  );
}

function Journal({ p, exp }: { p: Participant; exp: LabExperiment }) {
  const [all, setAll] = useState(false);
  if (p.journal.length === 0) return <p className="py-4 text-center text-sm text-muted">還沒有心得。第一天操作完就會出現在這裡。</p>;
  const shown = all ? p.journal : p.journal.slice(0, 5);
  const fillOf = new Map(p.fills.map((f) => [f.orderId, f]));
  return (
    <div>
      {shown.map((j) => {
        const orders = p.orders.filter((o) => o.day === j.day);
        const n = dayNumber(exp, j.day);
        return (
          <article key={j.day} className="border-t border-line py-4 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted">
              <span className="font-medium text-fg">{j.day > exp.end ? '結算日' : `第 ${n} 天`}</span>
              <span>{shortDay(j.day)}</span>
              {j.snapshot && (
                <span className="tabular">
                  總資產 {twd(j.snapshot.value)}（<span className={signClass(j.snapshot.returnPct)}>{fmtPct(j.snapshot.returnPct)}</span>）
                </span>
              )}
              {j.confidence !== undefined && <span aria-label={`信心 ${j.confidence} 分`}>信心 {'●'.repeat(j.confidence)}{'○'.repeat(5 - j.confidence)}</span>}
            </div>
            <h3 className="mt-1 font-semibold text-fg">{j.summary}</h3>
            <dl className="mt-2 space-y-2 text-sm leading-relaxed">
              <Field label="怎麼判斷">{j.market}</Field>
              <Field label="今天的決定">{j.decision}</Field>
              {orders.length > 0 && (
                <Field label="下的單">
                  <ul className="space-y-1.5">
                    {orders.map((o) => (
                      <li key={o.id}>
                        <OrderLine o={o} fill={fillOf.get(o.id)} />
                      </li>
                    ))}
                  </ul>
                </Field>
              )}
              {j.learned.length > 0 && (
                <Field label="學到的">
                  <Bullets items={j.learned} />
                </Field>
              )}
              {j.confused.length > 0 && (
                <Field label="看不懂的">
                  <Bullets items={j.confused} />
                </Field>
              )}
              <Field label="接下來">{j.plan}</Field>
            </dl>
            {j.pages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {j.pages.map((r, i) =>
                  r.startsWith('/') ? (
                    <Link key={i} to={r} className="rounded-full border border-line px-2 py-0.5 text-xs text-accent hover:bg-surface-2">
                      {pageLabel(r)}
                    </Link>
                  ) : (
                    <span key={i} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                      {r}
                    </span>
                  ),
                )}
              </div>
            )}
          </article>
        );
      })}
      {p.journal.length > 5 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 text-sm text-accent">
          {all ? '只看最近 5 天' : `看更早的心得（共 ${p.journal.length} 天）`}
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function OrderList({ orders, fills }: { orders: LabOrder[]; fills: LabFill[] }) {
  if (orders.length === 0) return <p className="text-sm text-muted">還沒有下過單。</p>;
  const fillOf = new Map(fills.map((f) => [f.orderId, f]));
  const sorted = [...orders].sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));
  return (
    <ul className="space-y-3">
      {sorted.map((o) => (
        <li key={o.id}>
          <div className="text-xs text-muted">{shortDay(o.day)} 下單</div>
          <OrderLine o={o} fill={fillOf.get(o.id)} />
        </li>
      ))}
    </ul>
  );
}

function DayList({ items, empty, showWho }: { items: { day: string; text: string; who?: string }[]; empty: string; showWho?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-16 shrink-0 text-xs leading-5 text-muted">
            {md(x.day)}
            {showWho && x.who ? ` ${x.who}` : ''}
          </span>
          <span className="min-w-0 text-fg">{x.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Feedback({ people }: { people: Participant[] }) {
  const items = people
    .flatMap((p) => p.journal.flatMap((j) => j.confused.map((text) => ({ day: j.day, text, who: p.name }))))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
  return (
    <Fold title={`兩位都看不懂的地方（${items.length} 項）`} sub="新手實際用網站時卡住的地方，可以拿來改進說明。">
      <DayList items={items} empty="還沒有。" showWho />
    </Fold>
  );
}

function Rules({ exp }: { exp: LabExperiment }) {
  const assets = exp.assets.map((id) => getAsset(id)).filter((a): a is AssetConfig => a !== undefined);
  return (
    <Fold title="實驗規則" sub="兩位的條件完全一樣，也看不到對方的紀錄。">
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg">
        <li>
          每位有虛擬的 {twd(exp.capital)}，可以買賣 {assets.map((a) => a.shortName).join('、')}，也可以放著現金。不能借錢、不能放空。
        </li>
        <li>
          期間 {shortDay(exp.start)}～{shortDay(exp.end)}，每天（含週末，比特幣週末也會動）台灣時間{runTimeText(exp.runTime)} 左右操作一次，{shortDay(exp.wrapUp)} 結算。
        </li>
        <li>學習的來源只有這個網站：先看網站上的說明、圖表、回測和預測，再自己決定。每筆單都要寫理由，每天寫心得。</li>
        <li>
          下單時不知道成交價，和真的下「預約單」一樣：
          {assets.map((a) => `${a.shortName}用${FILL_RULE[a.market]}`).join('；')}。
        </li>
        <li>買進用「要花多少新台幣」（至少 1,000 元，含手續費）；賣出用「賣掉持有的百分之幾」。每天最多 5 筆。</li>
        <li>
          手續費和稅和網站的回測一樣：0050 手續費 0.1425%（最低 20 元）、賣出交易稅 0.1%；VOO 不收手續費；比特幣手續費 0.1%。
          VOO 和比特幣用成交日前一天的美元兌新台幣收盤匯率換算。
        </li>
        <li>總資產用每天的收盤價估算。成交價和金額由程式依照行情資料計算，參加者不能自己填。</li>
        <li>
          對照的「{exp.benchmark.name}」：{exp.benchmark.intro}
        </li>
      </ul>
    </Fold>
  );
}
