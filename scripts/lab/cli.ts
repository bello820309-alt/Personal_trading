/*
 * AI 模擬交易的指令：npm run lab -- <指令> [選項]
 *
 * 給參加者（AI）用：
 *   me      --agent a                       自己的資產、還沒成交的單、之前的心得（每天先看這個）
 *   quote                                   最新收盤價和匯率
 *   buy     --agent a --asset 0050 --amount 100000 --reason "…"   用多少新台幣買進（含手續費）
 *   sell    --agent a --asset 0050 --pct 50 --reason "…"          賣掉持有的百分之幾
 *   cancel  --agent a --order a-2026-11-04-1                      取消還沒成交的單
 *   journal --agent a --file 心得.json                             寫今天的心得（同一天再寫會覆蓋）
 * 給主持人用：
 *   settle                                  依最新資料算出成交結果（每天讓參加者操作前執行）
 *   check                                   檢查檔案、列出大家的成績和今天的進度
 *   today                                   今天每位的心得重點（整理回報、檢查網站用）
 *
 * 測試用的環境變數：LAB_DIR（實驗資料夾，預設 public/lab）、LAB_NOW（假裝現在的時間，ISO 格式）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAsset } from '../../src/config/assets.ts';
import type { FxDataFile } from '../../src/data/fx.ts';
import { completedLength, parseAssetFile } from '../../src/data/parse.ts';
import type { AssetDataFile, Candle } from '../../src/data/types.ts';
import {
  agentAssets,
  availableCash,
  benchmarkOrders,
  dayNumber,
  FILL_RULE,
  marketAt,
  MAX_ORDERS_PER_DAY,
  MIN_BUY,
  pendingOrders,
  phaseOf,
  settleOrders,
  specialtyOf,
  standing,
  type LabMarket,
  type Standing,
} from '../../src/lab/engine.ts';
import { localTime, shortDay, TAIPEI } from '../../src/lab/time.ts';
import type { LabAgentFile, LabExperiment, LabFill, LabJournalEntry, LabOrder } from '../../src/lab/types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const labDir = resolve(process.env.LAB_DIR ?? join(root, 'public', 'lab'));
const dataDir = join(root, 'public', 'data');
const now = process.env.LAB_NOW ? new Date(process.env.LAB_NOW) : new Date();
if (Number.isNaN(now.getTime())) fail(`LAB_NOW 的格式不對：${process.env.LAB_NOW}`);
const nowIso = now.toISOString();
const local = localTime(now.getTime(), TAIPEI);
const today = local.date;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    fail(`讀不到 ${path}：${e instanceof Error ? e.message : String(e)}`);
  }
}

const exp = readJson<LabExperiment>(join(labDir, 'experiment.json'));

function agentPath(id: string): string {
  return join(labDir, `agent-${id}.json`);
}

function loadAgent(id: string): LabAgentFile {
  if (!exp.agents.some((a) => a.id === id)) fail(`沒有這位參加者：${id}（可以用：${exp.agents.map((a) => a.id).join('、')}）`);
  const path = agentPath(id);
  if (!existsSync(path)) return { schemaVersion: 1, id, orders: [], fills: [], journal: [] };
  return readJson<LabAgentFile>(path);
}

function saveAgent(file: LabAgentFile): void {
  writeFileSync(agentPath(file.id), `${JSON.stringify(file, null, 2)}\n`);
}

function loadMarket(): LabMarket & { updatedAt: Record<string, string> } {
  const candles: Record<string, Candle[]> = {};
  const updatedAt: Record<string, string> = {};
  for (const id of exp.assets) {
    const path = join(dataDir, `${id}.json`);
    if (!existsSync(path)) continue;
    const series = parseAssetFile(readJson<AssetDataFile>(path));
    candles[id] = series.candles.slice(0, completedLength(series));
    updatedAt[id] = series.meta.updatedAt;
  }
  const fxPath = join(dataDir, 'USDTWD.json');
  const fx = existsSync(fxPath) ? readJson<FxDataFile>(fxPath) : null;
  if (fx) updatedAt.USDTWD = fx.updatedAt;
  // 只用「現在」已經知道的資料（用 LAB_NOW 測試過去的某一天時，不會看到之後的價格）
  return { ...marketAt({ candles, fx }, now.getTime()), updatedAt };
}

// ---------- 參數 ----------

const [command, ...rest] = process.argv.slice(2);
const opts: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) {
  const k = rest[i]!;
  if (!k.startsWith('--')) fail(`看不懂的參數：${k}`);
  const v = rest[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`${k} 後面要接一個值`);
  opts[k.slice(2)] = v;
  i++;
}
const need = (k: string): string => opts[k] ?? fail(`缺少 --${k}`);

// ---------- 顯示 ----------

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const twd = (v: number) => `${v < 0 ? '-' : ''}NT$${nf0.format(Math.abs(Math.round(v)))}`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${twd(v)}`;
const pct = (v: number, d = 2) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
const slash = (d: string) => d.replaceAll('-', '/');

function price(assetId: string, v: number): string {
  const a = getAsset(assetId)!;
  const digits = a.market === 'crypto' && v >= 1000 ? 0 : 2;
  return `${a.currencySymbol}${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function units(assetId: string, v: number): string {
  const a = getAsset(assetId)!;
  if (a.market === 'tw') return `${nf0.format(v)} 股`;
  if (a.market === 'us') return `${v.toLocaleString('en-US', { maximumFractionDigits: 4 })} 股`;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 8 })} 顆`;
}

function describeOrder(o: LabOrder): string {
  const name = getAsset(o.asset)?.shortName ?? o.asset;
  return o.side === 'buy' ? `買進 ${name} ${twd(o.amount ?? 0)}` : `賣出 ${name} 持有的 ${o.pct}%`;
}

function describeFill(f: LabFill): string {
  const name = getAsset(f.asset)?.shortName ?? f.asset;
  const when = localTime(Date.parse(f.at), TAIPEI);
  const head = `${slash(when.date).slice(5)} ${when.hm}`;
  if (f.status !== 'filled') return `${head}  ${f.side === 'buy' ? '買進' : '賣出'} ${name}：沒有成交（${f.note}）`;
  const fx = f.fx ? `，匯率 ${f.fx}` : '';
  const costs = `手續費 ${twd(f.fee ?? 0)}${f.tax ? `、稅 ${twd(f.tax)}` : ''}`;
  return f.side === 'buy'
    ? `${head}  買進 ${name} ${units(f.asset, f.units!)} @ ${price(f.asset, f.price!)}${fx}，花 ${twd(-f.cash!)}（${costs}）`
    : `${head}  賣出 ${name} ${units(f.asset, f.units!)} @ ${price(f.asset, f.price!)}${fx}，拿回 ${twd(f.cash!)}（${costs}）`;
}

function quoteLines(market: LabMarket, assets: string[] = exp.assets): string[] {
  const lines: string[] = [];
  for (const id of assets) {
    const c = market.candles[id];
    const a = getAsset(id);
    if (!c?.length || !a) continue;
    const last = c[c.length - 1]!;
    const ch = (n: number) => (c.length > n ? pct(last.close / c[c.length - 1 - n]!.close - 1) : '—');
    lines.push(
      `  ${a.shortName.padEnd(5)} ${slash(last.time)} 收盤 ${price(id, last.close).padStart(11)}   前一天 ${ch(1).padStart(7)}   近 5 天 ${ch(5).padStart(7)}   近 20 天 ${ch(20).padStart(7)}`,
    );
  }
  const fx = market.fx;
  const usd = assets.some((id) => getAsset(id)?.currency === 'USD');
  if (usd && fx?.t.length) lines.push(`  匯率  1 美元 = ${fx.c[fx.c.length - 1]} 新台幣（${slash(fx.t[fx.t.length - 1]!)}）`);
  return lines;
}

function standingLines(s: Standing): string[] {
  const lines = [`總資產 ${twd(s.value)}（${pct(s.returnPct)}）`, `現金   ${twd(s.cash)}`];
  for (const h of s.valuation.holdings) {
    lines.push(
      `  ${h.asset.shortName.padEnd(5)} ${units(h.asset.id, h.units)}  平均成本 ${price(h.asset.id, h.avgCost)}  現價 ${price(h.asset.id, h.price)}（${slash(h.priceDate).slice(5)} 收盤）` +
        `  市值 ${twd(h.value)}  損益 ${signed(h.pnl)}（${pct(h.pnlPct)}）`,
    );
  }
  if (s.valuation.holdings.length === 0) lines.push('  （目前沒有持股）');
  return lines;
}

function phaseNote(): string {
  const phase = phaseOf(exp, today);
  const n = dayNumber(exp, today);
  const total = dayNumber(exp, exp.end);
  if (phase === 'before') return `實驗還沒開始（第一天是 ${slash(exp.start)}）`;
  if (phase === 'running') return `第 ${n} 天／共 ${total} 天`;
  if (phase === 'wrapup') return '結算日（不能再下單，只寫最後的心得）';
  return '實驗已經結束';
}

// ---------- 指令 ----------

function cmdMe(): void {
  const id = need('agent');
  const file = loadAgent(id);
  const agent = exp.agents.find((a) => a.id === id)!;
  const market = loadMarket();
  const s = standing(exp.capital, file.fills, market, today);
  const pending = pendingOrders(file.orders, file.fills);
  const out: string[] = [];
  out.push(`=== ${agent.name}：${phaseNote()}（今天 ${slash(today)}，台灣時間 ${local.hm}）===`);
  out.push(`實驗期間 ${slash(exp.start)} ～ ${slash(exp.end)}，${slash(exp.wrapUp)} 結算；本金 ${twd(exp.capital)}`);
  const mine = agentAssets(exp, id);
  const special = specialtyOf(exp, id);
  out.push(
    special
      ? `你專攻 ${getAsset(special)?.shortName ?? special}：只能買賣這一檔，學習時也專心研究它。`
      : `你可以買賣：${mine.map((x) => getAsset(x)?.shortName ?? x).join('、')}（也可以放著現金）。`,
  );
  out.push('', '【今天的價格】（最後一根已收盤的日 K）', ...quoteLines(market, mine));
  out.push('', '【你現在的資產】（用最新收盤價估算）', ...standingLines(s));
  out.push(`可以拿來下買單的現金：${twd(availableCash(exp.capital, file.orders, file.fills))}（已經扣掉還沒成交的買單）`);
  out.push('', '【還沒成交的單】');
  if (pending.length === 0) out.push('  （沒有）');
  for (const o of pending) out.push(`  ${o.id}  ${describeOrder(o)} → 會用「${FILL_RULE[getAsset(o.asset)!.market]}」成交`);
  const recentFills = [...file.fills].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
  out.push('', '【最近的成交】');
  if (recentFills.length === 0) out.push('  （還沒有）');
  for (const f of recentFills) out.push(`  ${describeFill(f)}`);
  const journal = [...file.journal].sort((a, b) => (a.day < b.day ? -1 : 1));
  out.push('', '【你之前寫的心得】（最近 5 天）');
  if (journal.length === 0) out.push('  （還沒有，今天是第一次）');
  for (const j of journal.slice(-5)) out.push(`  ${shortDay(j.day)} ${j.summary}`, `      打算：${j.plan}`);
  const lastJ = journal[journal.length - 1];
  if (lastJ) out.push('', `【上一次（${shortDay(lastJ.day)}）的決定】`, `  ${lastJ.decision}`);
  const learned = journal.flatMap((j) => j.learned.map((x) => `${shortDay(j.day)} ${x}`));
  out.push('', '【你到目前學到的東西】');
  if (learned.length === 0) out.push('  （還沒有）');
  for (const x of learned) out.push(`  - ${x}`);
  const confused = journal.flatMap((j) => j.confused.map((x) => `${shortDay(j.day)} ${x}`));
  if (confused.length) out.push('', '【你之前看不懂的地方】', ...confused.map((x) => `  - ${x}`));
  console.log(out.join('\n'));
}

function cmdQuote(): void {
  console.log(['最新收盤價（每個標的最後一根已收盤的日 K）：', ...quoteLines(loadMarket())].join('\n'));
}

function requireTrading(): void {
  const phase = phaseOf(exp, today);
  if (phase === 'before') fail(`實驗還沒開始，${slash(exp.start)} 才能下單`);
  if (phase === 'wrapup') fail('今天是結算日，不能再下單了，只要寫最後的心得');
  if (phase !== 'running') fail('實驗已經結束，不能再下單了');
}

function newOrder(file: LabAgentFile, partial: Omit<LabOrder, 'id' | 'placedAt' | 'day'>): void {
  const todays = file.orders.filter((o) => o.day === today).length;
  if (todays >= MAX_ORDERS_PER_DAY) fail(`今天已經下了 ${todays} 筆單，每天最多 ${MAX_ORDERS_PER_DAY} 筆`);
  const reason = partial.reason.trim();
  if (!reason) fail('請用 --reason 寫下這筆單的理由');
  if (reason.length > 300) fail('理由太長了（最多 300 字）');
  const o: LabOrder = { id: `${file.id}-${today}-${todays + 1}`, placedAt: nowIso, day: today, ...partial, reason };
  file.orders.push(o);
  saveAgent(file);
  console.log(`✓ 已下單 ${o.id}：${describeOrder(o)}`);
  console.log(`  會用「${FILL_RULE[getAsset(o.asset)!.market]}」成交，明天再用 me 看成交結果。`);
}

function assetArg(agentId: string): string {
  const asset = need('asset').toUpperCase();
  const allowed = agentAssets(exp, agentId);
  if (!allowed.includes(asset)) {
    const special = specialtyOf(exp, agentId);
    fail(special ? `你專攻 ${special}，只能買賣 ${special}` : `不能買賣 ${asset}（可以用：${allowed.join('、')}）`);
  }
  return asset;
}

function cmdBuy(): void {
  requireTrading();
  const file = loadAgent(need('agent'));
  const asset = assetArg(file.id);
  const amount = Math.round(Number(need('amount').replaceAll(',', '')));
  if (!Number.isFinite(amount) || amount < MIN_BUY) fail(`買進金額至少 ${twd(MIN_BUY)}`);
  const cash = availableCash(exp.capital, file.orders, file.fills);
  if (amount > cash) fail(`現金不夠：可以用的現金只有 ${twd(cash)}（已經扣掉還沒成交的買單）`);
  newOrder(file, { asset, side: 'buy', amount, reason: need('reason') });
}

function cmdSell(): void {
  requireTrading();
  const file = loadAgent(need('agent'));
  const asset = assetArg(file.id);
  const p = Number(need('pct').replace('%', ''));
  if (!Number.isFinite(p) || p <= 0 || p > 100) fail('--pct 要是 1～100 之間的數字（賣掉持有的百分之幾）');
  const market = loadMarket();
  const held = standing(exp.capital, file.fills, market, today).state.holdings[asset]?.units ?? 0;
  const buying = pendingOrders(file.orders, file.fills).some((o) => o.asset === asset && o.side === 'buy');
  if (held <= 0 && !buying) fail(`你沒有 ${asset} 可以賣`);
  newOrder(file, { asset, side: 'sell', pct: Math.round(p * 100) / 100, reason: need('reason') });
}

function cmdCancel(): void {
  requireTrading();
  const file = loadAgent(need('agent'));
  const id = need('order');
  const o = pendingOrders(file.orders, file.fills).find((x) => x.id === id);
  if (!o) fail(`找不到還沒成交的單 ${id}`);
  o.cancelledAt = nowIso;
  saveAgent(file);
  console.log(`✓ 已取消 ${id}：${describeOrder(o)}`);
}

const str = (v: unknown, name: string, max: number, required = true): string => {
  if (typeof v !== 'string' || (required && !v.trim())) fail(`心得的「${name}」要是文字${required ? '，而且不能空白' : ''}`);
  const s = v.trim();
  if (s.length > max) fail(`心得的「${name}」太長了（最多 ${max} 字，現在 ${s.length} 字）`);
  return s;
};
const list = (v: unknown, name: string, max = 10): string[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v)) fail(`心得的「${name}」要是文字的陣列，例如 ["…", "…"]`);
  if (v.length > max) fail(`心得的「${name}」最多 ${max} 項`);
  return v.map((x, i) => str(x, `${name}第 ${i + 1} 項`, 200)).filter(Boolean);
};

function cmdJournal(): void {
  const file = loadAgent(need('agent'));
  const phase = phaseOf(exp, today);
  if (phase === 'before') fail(`實驗還沒開始，${slash(exp.start)} 才開始寫心得`);
  if (phase === 'done') fail('實驗已經結束');
  const raw = readJson<Record<string, unknown>>(resolve(need('file')));
  const confidence = raw.confidence;
  if (confidence !== undefined && (typeof confidence !== 'number' || !Number.isInteger(confidence) || confidence < 1 || confidence > 5)) {
    fail('「confidence」要是 1～5 的整數');
  }
  const s = standing(exp.capital, file.fills, loadMarket(), today);
  const entry: LabJournalEntry = {
    day: today,
    writtenAt: nowIso,
    summary: str(raw.summary, 'summary（一句話總結）', 100),
    market: str(raw.market, 'market（對市場的看法）', 1000),
    decision: str(raw.decision, 'decision（今天的決定和理由）', 1000),
    learned: list(raw.learned, 'learned（學到的）'),
    confused: list(raw.confused, 'confused（看不懂的地方）'),
    // 參加者被要求把自己的規則完整寫在 plan 裡（隔天的 me 會顯示），所以給多一點空間
    plan: str(raw.plan, 'plan（接下來的打算）', 1200),
    // 有時候會多看幾頁（例如先到列表找頁面），讓它們都記得下來
    pages: list(raw.pages, 'pages（看了哪些頁面）', 15),
    ...(confidence !== undefined ? { confidence: confidence as number } : {}),
    snapshot: { value: Math.round(s.value), cash: Math.round(s.cash), returnPct: Math.round(s.returnPct * 1e6) / 1e6 },
  };
  const i = file.journal.findIndex((j) => j.day === today);
  if (i >= 0) file.journal[i] = entry;
  else file.journal.push(entry);
  saveAgent(file);
  console.log(`✓ 已${i >= 0 ? '更新' : '寫入'} ${slash(today)} 的心得：${entry.summary}`);
}

function cmdSettle(): void {
  const market = loadMarket();
  for (const agent of exp.agents) {
    const file = loadAgent(agent.id);
    const fresh = settleOrders(file.orders, file.fills, market, exp.capital, nowIso);
    if (fresh.length) {
      file.fills.push(...fresh);
      saveAgent(file);
    }
    console.log(`${agent.name}：新成交 ${fresh.length} 筆，還沒成交 ${pendingOrders(file.orders, file.fills).length} 筆`);
    for (const f of fresh) console.log(`  ${describeFill(f)}`);
  }
}

function cmdCheck(): void {
  const market = loadMarket();
  const problems: string[] = [];
  const out: string[] = [`=== ${exp.title}：${phaseNote()}（${slash(today)} ${local.hm}）===`, '', '資料：'];
  for (const id of exp.assets) {
    const c = market.candles[id];
    out.push(`  ${id.padEnd(6)} 最後一根 ${c?.length ? slash(c[c.length - 1]!.time) : '沒有資料'}，抓取時間 ${market.updatedAt[id] ?? '—'}`);
    if (!c?.length) problems.push(`${id} 沒有資料`);
  }
  const fx = market.fx;
  out.push(`  USDTWD 最後一天 ${fx?.t.length ? slash(fx.t[fx.t.length - 1]!) : '沒有資料'}，抓取時間 ${market.updatedAt.USDTWD ?? '—'}`);
  if (!fx?.t.length) problems.push('沒有匯率資料');
  out.push('', '成績（用最新收盤價估算）：');
  for (const agent of exp.agents) {
    const file = loadAgent(agent.id);
    const s = standing(exp.capital, file.fills, market, today);
    const pending = pendingOrders(file.orders, file.fills);
    const todayOrders = file.orders.filter((o) => o.day === today);
    const wrote = file.journal.some((j) => j.day === today);
    const special = specialtyOf(exp, agent.id);
    let ref = '';
    if (special) {
      const refFills = settleOrders(benchmarkOrders(exp, { [special]: 1 }), [], market, exp.capital, nowIso);
      ref = refFills.length ? `（同一檔分批買進不動：${pct(standing(exp.capital, refFills, market, today).returnPct)}）` : '';
    }
    out.push(
      `  ${agent.name}：${twd(s.value)}（${pct(s.returnPct)}）${ref}，現金 ${twd(s.cash)}，成交 ${s.state.trades} 筆，還沒成交 ${pending.length} 筆；` +
        `今天下單 ${todayOrders.length} 筆，今天的心得${wrote ? '已寫' : '還沒寫'}`,
    );
    // 檔案檢查
    const ids = new Set<string>();
    for (const o of file.orders) {
      if (ids.has(o.id)) problems.push(`${agent.name} 有重複的單號 ${o.id}`);
      ids.add(o.id);
      if (!agentAssets(exp, agent.id).includes(o.asset)) problems.push(`${agent.name} 的 ${o.id} 標的不對：${o.asset}`);
    }
    for (const f of file.fills) if (!ids.has(f.orderId)) problems.push(`${agent.name} 的成交紀錄找不到對應的單：${f.orderId}`);
    if (new Set(file.fills.map((f) => f.orderId)).size !== file.fills.length) problems.push(`${agent.name} 有重複的成交紀錄`);
    for (const o of pending) {
      const ageDays = (now.getTime() - Date.parse(o.placedAt)) / 86400000;
      if (ageDays > 4) problems.push(`${agent.name} 的 ${o.id} 已經 ${Math.floor(ageDays)} 天沒有成交（資料可能沒有更新）`);
    }
    if (s.cash < -1) problems.push(`${agent.name} 的現金變成負的（${twd(s.cash)}）`);
  }
  const benchFills = settleOrders(benchmarkOrders(exp), [], market, exp.capital, nowIso);
  if (benchFills.length) {
    const b = standing(exp.capital, benchFills, market, today);
    out.push(`  ${exp.benchmark.name}（對照）：${twd(b.value)}（${pct(b.returnPct)}）`);
  } else {
    out.push(`  ${exp.benchmark.name}（對照）：還沒成交`);
  }
  out.push('', problems.length ? `⚠ 有 ${problems.length} 個問題：` : '✓ 檔案檢查沒有問題');
  for (const p of problems) out.push(`  - ${p}`);
  console.log(out.join('\n'));
  if (problems.length) process.exitCode = 1;
}

function cmdToday(): void {
  const out: string[] = [`=== ${slash(today)}（${phaseNote()}）每位的心得重點 ===`];
  for (const agent of exp.agents) {
    const file = loadAgent(agent.id);
    const j = file.journal.find((x) => x.day === today);
    out.push('', `【${agent.name}】${j ? j.summary : '（今天還沒寫心得）'}`);
    if (!j) continue;
    out.push(`  決定：${j.decision}`);
    for (const o of file.orders.filter((x) => x.day === today)) out.push(`  下單：${describeOrder(o)}${o.cancelledAt ? '（已取消）' : ''}`);
    if (j.confused.length) out.push('  看不懂：', ...j.confused.map((x) => `    - ${x}`));
    if (j.pages.length) out.push(`  看了：${j.pages.join('、')}`);
  }
  console.log(out.join('\n'));
}

const COMMANDS: Record<string, () => void> = {
  me: cmdMe,
  quote: cmdQuote,
  buy: cmdBuy,
  sell: cmdSell,
  cancel: cmdCancel,
  journal: cmdJournal,
  settle: cmdSettle,
  check: cmdCheck,
  today: cmdToday,
};

const run = command ? COMMANDS[command] : undefined;
if (!run) fail(`用法：npm run lab -- <${Object.keys(COMMANDS).join('|')}> [選項]（說明在 scripts/lab/cli.ts 最上面）`);
run();
