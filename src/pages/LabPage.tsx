import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LineChart, type LineSpec } from '../components/chart/LineChart';
import { Card, Fold, Notice, PageTitle, Segmented, Spinner } from '../components/ui';
import { getAsset, type AssetConfig } from '../config/assets';
import { fmtPct, signClass } from '../data/format';
import {
  agentAssets,
  benchmarkOrders,
  dayNumber,
  equitySeries,
  FILL_RULE,
  marketAt,
  pendingOrders,
  phaseOf,
  settleOrders,
  specialtyOf,
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

interface Participant {
  id: string;
  name: string;
  intro: string;
  /** 第幾位（決定顏色）；對照組是 -1 */
  slot: number;
  bench: boolean;
  /** 可以買賣什麼，例如「三檔都可以」「只買 0050」 */
  scope: string;
  orders: LabOrder[];
  fills: LabFill[];
  journal: LabJournalEntry[];
  now: Standing;
  series: EquityPoint[];
  /** 專攻一檔的參加者：同一檔「分批買進不動」的成績 */
  ref?: { name: string; returnPct: number; value: number };
}

/** 每位參加者的顏色（和圖表上的線一樣） */
function useColors(): (p: Participant) => string {
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const t = getChartTheme(theme, colorMode);
  const palette = [t.accent, t.hot, t.series[2]!, t.series[3]!, t.series[4]!, t.series[5]!, t.series[0]!];
  return (p) => (p.bench ? t.textMuted : palette[p.slot % palette.length]!);
}

export function LabPage() {
  const state = useLab();
  return (
    <div>
      <PageTitle sub="五個新手 AI 只靠這個網站學技術分析，各拿虛擬的 100 萬台幣操作一個月：兩位三檔都可以買，三位各專攻一檔。每天記下怎麼想、怎麼做。">
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
    const nowIso = new Date(nowMs).toISOString();
    const make = (p: Omit<Participant, 'now' | 'series'>): Participant => ({
      ...p,
      now: standing(exp.capital, p.fills, market, lastDay),
      series: started ? equitySeries(exp.capital, p.fills, market, from, lastDay) : [],
    });
    const people = exp.agents.map((a, i) => {
      const file = data.agents[i]!;
      const special = specialtyOf(exp, a.id);
      let ref: Participant['ref'];
      if (special) {
        const fills = settleOrders(benchmarkOrders(exp, { [special]: 1 }), [], market, exp.capital, nowIso);
        const st = standing(exp.capital, fills, market, lastDay);
        ref = { name: `只買 ${assetName(special)}、${exp.benchmark.name}`, returnPct: st.returnPct, value: st.value };
      }
      return make({
        id: a.id,
        name: a.name,
        intro: a.intro,
        slot: i,
        bench: false,
        scope: special ? `只買 ${assetName(special)}` : agentAssets(exp, a.id).length === exp.assets.length ? '三檔都可以' : agentAssets(exp, a.id).map(assetName).join('、'),
        orders: file.orders,
        fills: file.fills,
        journal: [...file.journal].sort((x, y) => (x.day < y.day ? 1 : -1)),
        ref,
      });
    });
    const benchOrders = benchmarkOrders(exp);
    const bench = make({
      id: 'bench',
      name: exp.benchmark.name,
      intro: exp.benchmark.intro,
      slot: -1,
      bench: true,
      scope: (exp.benchmark.tranches ?? 1) > 1 ? `三檔平均、分 ${exp.benchmark.tranches} 次買進` : '三檔平均買進',
      orders: benchOrders,
      fills: settleOrders(benchOrders, [], market, exp.capital, nowIso),
      journal: [],
    });
    return { today, market, people, bench };
  }, [data, exp, nowMs]);

  const selected = view.people.find((p) => p.id === who) ?? view.people[0];
  const anyFill = [...view.people, view.bench].some((p) => p.fills.some((f) => f.status === 'filled'));

  return (
    <div className="space-y-4">
      <StatusLine exp={exp} today={view.today} />
      <Ranking people={[...view.people, view.bench]} capital={exp.capital} nowMs={nowMs} />
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
  const when = `每個平日（週一到週五）台灣時間${runTimeText(exp.runTime)} 左右操作一次`;
  let text: ReactNode;
  if (phase === 'before') text = <>實驗還沒開始：第一天是 <b className="text-fg">{shortDay(exp.start)}</b>，{when}，共 {total} 天。</>;
  else if (phase === 'running')
    text = (
      <>
        <b className="text-fg">第 {dayNumber(exp, today)} 天</b>／共 {total} 天（{md(exp.start)}～{md(exp.end)}）・{when}，下單後隔天成交
      </>
    );
  else if (phase === 'wrapup') text = <>今天是結算日：不再下單，大家寫下最後的心得。</>;
  else text = <>實驗已經結束（{md(exp.start)}～{md(exp.end)}），下面是最後的成績。</>;
  return <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{text}</p>;
}

function Ranking({ people, capital, nowMs }: { people: Participant[]; capital: number; nowMs: number }) {
  const colorOf = useColors();
  // 依報酬率排名；一樣時照原本的順序（開始前大家都是 0%）
  const sorted = people.map((p, i) => ({ p, i })).sort((a, b) => b.p.now.returnPct - a.p.now.returnPct || a.i - b.i);
  return (
    <Card>
      <H2 sub="依報酬率排序，用最新的收盤價估算（含現金）。">成績</H2>
      <ol className="divide-y divide-line">
        {sorted.map(({ p }, rank) => {
          const ret = p.now.returnPct;
          const cashPct = p.now.value > 0 ? p.now.cash / p.now.value : 1;
          // 對照組的單是照時間表才下，還沒到的不算「待成交」
          const pending = pendingOrders(p.orders, p.fills).filter((o) => Date.parse(o.placedAt) <= nowMs).length;
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="w-4 shrink-0 text-center text-sm tabular text-muted">{rank + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(p) }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="font-medium text-fg">{p.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.bench ? 'border border-dashed border-line text-muted' : 'bg-surface-2 text-muted'}`}>
                    {p.bench ? '對照' : p.scope}
                  </span>
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted">
                  {p.bench ? p.scope : `現金 ${fmtPct(cashPct, 0, false)}・成交 ${p.now.state.trades} 筆`}
                  {pending > 0 ? `・待成交 ${pending} 筆` : ''}
                  {p.ref ? `・同一檔分批買 ${fmtPct(p.ref.returnPct)}` : ''}
                </div>
              </div>
              <div className="shrink-0 text-right tabular">
                <div className="text-sm font-semibold text-fg">{twd(p.now.value)}</div>
                <div className={`text-xs ${signClass(ret)}`}>
                  {fmtPct(ret)}
                  <span className="hidden text-muted sm:inline">（{twdSigned(p.now.value - capital)}）</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function ValueChart({ people }: { people: Participant[] }) {
  const colorOf = useColors();
  const colors = people.map(colorOf).join('|');
  const lines = useMemo<LineSpec[]>(() => {
    const list = colors.split('|');
    return people.map((p, i) => ({
      key: p.id,
      label: p.name,
      color: list[i]!,
      width: p.bench ? 1 : 2,
      dashed: p.bench,
      showLastValue: false,
      points: p.series.map((x) => ({ time: x.time, value: Math.round(x.value) })),
    }));
  }, [people, colors]);
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
  const colorOf = useColors();
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-start gap-2">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(p) }} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-fg">
              {p.name} 現在的資產<span className="ml-2 text-xs font-normal text-muted">{p.scope}</span>
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{p.intro}用最新的收盤價估算；損益已經扣掉買進的手續費。</p>
          </div>
        </div>
        <Holdings p={p} />
        {p.ref && (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
            對照：同樣 100 萬{p.ref.name}，現在是 <span className="text-fg tabular">{twd(p.ref.value)}</span>（
            <span className={signClass(p.ref.returnPct)}>{fmtPct(p.ref.returnPct)}</span>）。比一比認真操作有沒有比較好。
          </p>
        )}
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
    <Fold title={`大家看不懂的地方（${items.length} 項）`} sub="新手實際用網站時卡住的地方。網站有錯會當天修正、說明不夠會當天補上。">
      <DayList items={items} empty="還沒有。" showWho />
    </Fold>
  );
}

function Rules({ exp }: { exp: LabExperiment }) {
  const assets = exp.assets.map((id) => getAsset(id)).filter((a): a is AssetConfig => a !== undefined);
  const specialists = exp.agents.filter((a) => specialtyOf(exp, a.id));
  const generalists = exp.agents.filter((a) => !specialtyOf(exp, a.id));
  return (
    <Fold title="實驗規則" sub="大家的條件一樣，互相看不到對方的紀錄。">
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg">
        <li>
          每位都有虛擬的 {twd(exp.capital)}，也可以放著現金；不能借錢、不能放空。
          {generalists.length > 0 && `${generalists.map((a) => a.name).join('、')} 可以買賣 ${assets.map((a) => a.shortName).join('、')}；`}
          {specialists.length > 0 &&
            `${specialists.map((a) => `${a.name}只能買賣 ${assetName(specialtyOf(exp, a.id)!)}`).join('、')}。`}
        </li>
        <li>
          期間 {shortDay(exp.start)}～{shortDay(exp.end)}，台灣時間{runTimeText(exp.runTime)} 左右操作一次，{shortDay(exp.wrapUp)} 結算。一開始是每天（含週末）都操作；為了節省用量，11/14 起改成只在平日（週一到週五）操作。11/12、11/13 因為排程出了問題沒有操作，那兩天沒有心得。
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
          對照的「{exp.benchmark.name}」：{exp.benchmark.intro}專攻一檔的參加者另外和「同樣 100 萬只買那一檔、用一樣的方式分批買進」比較。
        </li>
        <li>每天看完大家的心得，網站有錯就當天修正、說明不夠就當天補上，隔天大家用新的說明學習。</li>
      </ul>
    </Fold>
  );
}
