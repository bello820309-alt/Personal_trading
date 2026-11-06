import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { BacktestTabs } from '../components/BacktestTabs';
import { DataTimeNote } from '../components/DataTimeNote';
import { PeriodPicker } from '../components/PeriodPicker';
import { LineChart, type LineSpec } from '../components/chart/LineChart';
import { PriceChart, type ChartIndicator, type ChartMarker } from '../components/chart/PriceChart';
import { CloseIcon } from '../components/icons';
import { Card, Fold, Notice, PageTitle, Segmented } from '../components/ui';
import { getAsset, type AssetConfig } from '../config/assets';
import {
  CADENCES,
  CADENCE_LABELS,
  CADENCE_NOW,
  MAX_RULES,
  defaultPlan,
  isAbove,
  isBelow,
  nice,
  plainPlan,
  runDca,
  zoneAt,
  type Cadence,
  type DcaAction,
  type DcaPlan,
  type DcaResult,
  type LadderRule,
  type SellMode,
} from '../backtest/dca';
import { actionText, baseZoneText, conditionText, dcaNotes, money, nowAdvice, summarizeDca, unitsText } from '../backtest/dcaSummary';
import { buildPresets, type PeriodPreset } from '../backtest/rankPeriods';
import { daysBetween, fmtDate, fmtNum, fmtPct, fmtPrice, signClass } from '../data/format';
import { useAsset } from '../data/load';
import { completedLength } from '../data/parse';
import { indexRange, isIsoDate } from '../data/range';
import { adjustCandles } from '../data/resample';
import type { AssetSeries, Candle } from '../data/types';
import type { ColorRole } from '../indicators/types';
import { navigate, useLocation, withQuery } from '../router';
import { useResolvedTheme, useSettings } from '../store/settings';
import { getChartTheme } from '../theme';

type Go = (patch: Record<string, string | null | undefined>) => void;

const SELL_MODE_LABELS: Record<SellMode, string> = { every: '每期都賣', once: '每個價位只賣一次' };
const SELL_MODE_SHORT: Record<SellMode, string> = { every: '每期都賣', once: '每價位賣一次' };
const SELL_MODE_HELP: Record<SellMode, string> = {
  every: '每期都賣：只要價格還在賣出的價位以上，每一期都賣出「當時持有的」那個百分比（持有越來越少，不會一次賣光）。',
  once: '每個價位只賣一次：第一次漲到那個價位時賣出；價格跌回基準價格以下之後，才會再賣。一次跳過好幾個價位時，每個價位都會賣。',
};

export function DcaPage() {
  const { query } = useLocation();
  // 這個功能以比特幣為主，沒有指定標的時預設比特幣
  const asset = getAsset(query.get('asset')) ?? getAsset('BTC')!;
  const state = useAsset(asset.id);
  const p = query.get('p');
  const from = query.get('from');
  const to = query.get('to');
  const go: Go = (patch) => navigate(withQuery('/backtest/dca', { asset: asset.id, p, from, to, ...patch }), { replace: true });
  return (
    <div>
      <PageTitle sub="跌越多買越多、漲越多買越少，漲到很高就分批賣出。設定你自己的價格階梯，看這一期該怎麼做，並回測和一般定投（每期固定金額、不賣）比較。">
        回測
      </PageTitle>
      <BacktestTabs active="dca" assetId={asset.id} />
      <div className="mb-4">
        <AssetTabs value={asset.id} onChange={(id) => go({ asset: id, p: null, from: null, to: null })} />
      </div>
      {state.status === 'ready' ? (
        <DcaView key={asset.id} asset={asset} series={state.data} presetKey={p} from={from} to={to} go={go} />
      ) : (
        <AssetStateView state={state} name={asset.name} />
      )}
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

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed text-fg">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

const fmtRate = (r: number) => `${fmtNum(r * 100, 4).replace(/\.?0+$/, '')}%`;

function DcaView({
  asset,
  series,
  presetKey,
  from,
  to,
  go,
}: {
  asset: AssetConfig;
  series: AssetSeries;
  presetKey: string | null;
  from: string | null;
  to: string | null;
  go: Go;
}) {
  const n = completedLength(series);
  const lastTime = series.candles[n - 1]?.time ?? '';
  const lastClose = series.candles[n - 1]?.close ?? 0;
  // 回測只用已收盤的 K 棒（股票用還原權息的價格）；比特幣每分鐘的即時價格只用在「這一期該怎麼做」
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const candles = useMemo(() => adjustCandles(series.candles, series.adjClose).slice(0, n), [n, lastTime, lastClose]);
  const nowPrice = series.candles[series.candles.length - 1]?.close ?? lastClose;

  const stored = useSettings((s) => s.dcaPlans[asset.id]);
  const setDcaPlan = useSettings((s) => s.setDcaPlan);
  const plan = useMemo(() => stored ?? defaultPlan(asset.id, lastClose), [stored, asset.id, lastClose]);
  // 第一次打開時就把預設的階梯存起來：股票的預設以當時的價格為基準，存起來之後才不會每天跟著價格移動
  useEffect(() => {
    if (!stored && lastClose > 0) setDcaPlan(asset.id, { ...defaultPlan(asset.id, lastClose), setOn: lastTime });
  }, [stored, asset.id, lastClose, lastTime, setDcaPlan]);
  // 自己改了基準價格，就記下改的日期
  const save = (p: DcaPlan) =>
    setDcaPlan(asset.id, {
      ...p,
      rules: [...p.rules].sort((a, b) => b.price - a.price),
      ...(p.basePrice !== plan.basePrice ? { setOn: lastTime } : {}),
    });
  const costs = useMemo(() => ({ feeRate: asset.costs.feeRate * asset.costs.feeDiscount, sellTaxRate: asset.costs.sellTaxRate }), [asset]);

  const presets = useMemo(() => buildPresets(candles, asset.id), [candles, asset.id]);
  const first = candles[0]?.time ?? '';
  const last = candles[candles.length - 1]?.time ?? '';
  const preset = presets.find((x) => x.key === presetKey);
  const custom = !preset && isIsoDate(from) && isIsoDate(to) && from <= to ? { key: 'custom', from, to } : null;
  const active = preset ?? custom ?? presets.find((x) => x.key === '2Y') ?? presets[0]!;
  const range = indexRange(candles, active.from, active.to);
  const rs = range?.start ?? -1;
  const re = range?.end ?? -1;

  const dyn = useMemo(() => (rs >= 0 ? runDca(candles, rs, re, plan, costs) : null), [candles, rs, re, plan, costs]);
  const plain = useMemo(() => (rs >= 0 ? runDca(candles, rs, re, plainPlan(plan), costs) : null), [candles, rs, re, plan, costs]);
  const hasSell = plan.rules.some((r) => r.action.kind === 'sell' && isAbove(plan, r));
  const altPlan = useMemo<DcaPlan>(() => ({ ...plan, sellMode: plan.sellMode === 'every' ? 'once' : 'every' }), [plan]);
  const alt = useMemo(() => (rs >= 0 && hasSell ? runDca(candles, rs, re, altPlan, costs) : null), [candles, rs, re, altPlan, costs, hasSell]);

  const pick = (p: PeriodPreset) => go({ p: p.key, from: null, to: null });
  const setCustom = (f: string, t: string) => {
    if (isIsoDate(f) && isIsoDate(t)) go({ p: 'custom', from: f <= t ? f : t, to: f <= t ? t : f });
  };
  const advice = nowAdvice(plan, nowPrice, asset);

  return (
    <div className="space-y-4">
      <Card>
        <H2>{CADENCE_NOW[plan.cadence]}該怎麼做？</H2>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-muted">{asset.name}現在</span>
          <span className="text-2xl font-semibold text-fg tabular">{fmtPrice(nowPrice, asset)}</span>
          <span className="text-xs text-muted">
            <DataTimeNote series={series} compact />
          </span>
        </div>
        <div className="mt-3 rounded-lg border border-accent bg-accent/10 px-3 py-2">
          <div className="text-xs text-muted">落在「{advice.zone}」這一階</div>
          <div className="mt-0.5 text-lg font-semibold text-fg">{advice.action}</div>
        </div>
        {(advice.nextDown || advice.nextUp) && (
          <ul className="mt-2 space-y-0.5 text-sm text-muted">
            {advice.nextUp && <li>再{advice.nextUp}</li>}
            {advice.nextDown && <li>再{advice.nextDown}</li>}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">依照下面你設定的價格階梯算出來的；這不是投資建議。</p>
      </Card>

      <Card>
        <H2 sub="價格落在哪一階，這一期就照那一階做；碰到門檻就算（例如剛好 70,000 就買 120）。改完數字按 Enter 或點別的地方就會儲存，只存在這台裝置。">
          你的價格階梯
        </H2>
        {plan.setOn && (
          <p className="mb-3 text-xs leading-relaxed text-muted">
            基準價格 {fmtPrice(plan.basePrice, asset)} 是 {fmtDate(plan.setOn)} 設定的
            {asset.id === 'BTC' ? '' : '（預設用那天的收盤價）'}，之後不會自動改。換一台裝置、清除瀏覽資料或按「還原成預設」，會用當天的價格重新設定。
          </p>
        )}
        <LadderEditor plan={plan} asset={asset} nowPrice={nowPrice} onChange={save} onReset={() => setDcaPlan(asset.id, null)} />
      </Card>

      <Fold title="預設的階梯怎麼來的？金額怎麼換成自己的資金？" sub="預設只是例子，可以照自己的資金和想法改。">
        <DefaultsHelp asset={asset} />
      </Fold>
      <Fold title="「跌越多買越多」和「順勢操作」不是相反嗎？" sub="兩種不同的想法，目的不一樣。">
        <TrendVsDca />
      </Fold>

      <Card>
        <H2>回測期間</H2>
        <div className="space-y-3">
          <PeriodPicker presets={presets} activeKey={active.key} from={active.from} to={active.to} first={first} last={last} onPick={pick} onCustom={setCustom} />
          {range ? (
            <p className="text-xs text-muted">
              實際回測：{fmtDate(candles[rs]!.time)}～{fmtDate(candles[re]!.time)}（{daysBetween(candles[rs]!.time, candles[re]!.time)} 天）。資料範圍：
              {fmtDate(first)}～{fmtDate(last)}。
            </p>
          ) : (
            <p className="text-sm text-hot">這段期間沒有資料，請換一段期間（資料範圍：{fmtDate(first)}～{fmtDate(last)}）。</p>
          )}
        </div>
      </Card>

      {dyn && plain && (
        <>
          <Card>
            <H2>回測結果</H2>
            <Lines lines={summarizeDca(dyn, plain, plan, candles, asset)} />
            <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted">
              {dcaNotes(dyn, plan, asset).map((x) => (
                <li key={x}>・{x}</li>
              ))}
            </ul>
            <div className="mt-3">
              <Compare
                asset={asset}
                candles={candles}
                cols={[
                  { title: '你的設定', sub: hasSell ? SELL_MODE_SHORT[plan.sellMode] : '', r: dyn },
                  ...(alt ? [{ title: '換個賣法', sub: SELL_MODE_SHORT[altPlan.sellMode], r: alt }] : []),
                  { title: '一般定投', sub: `${CADENCE_LABELS[plan.cadence]} ${money(plan.baseAmount, asset)}`, r: plain },
                ]}
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              年化報酬（XIRR）把「什麼時候投入、投入多少」都算進去，投入金額不一樣時比較公平；期間不到一年時不計算。「帳面最差的時候」是總價值比累計投入少最多的時候。
            </p>
          </Card>

          <Card>
            <H2 sub="點狀橫線是你的價格階梯；下方的柱子是每一期買進的金額，向下的箭頭是賣出。">價格與每次買賣</H2>
            <DcaChart candles={candles} start={rs} end={re} plan={plan} dyn={dyn} asset={asset} />
          </Card>

          <Card>
            <H2 sub="實線是總價值（持有的價值＋賣出拿回的錢），虛線是累計投入的錢；實線在虛線上面就是賺錢。">資產變化</H2>
            <ValueChart candles={candles} dyn={dyn} plain={plain} asset={asset} />
          </Card>

          <Fold title="每一階出現幾次" sub="回測期間每次看價格時，價格落在哪一階。">
            <ZoneTable plan={plan} dyn={dyn} asset={asset} />
          </Fold>

          <Fold title={`交易明細（${dyn.events.length} 筆）`} sub="依照價格階梯，每一次的買進與賣出。">
            <EventTable plan={plan} dyn={dyn} candles={candles} asset={asset} />
          </Fold>
        </>
      )}

      <Notice>
        計算方式：操作日用當天的收盤價成交{asset.market === 'crypto' ? '（比特幣以世界標準時間 0 點為一天）' : ''}；可以買小數單位
        {asset.market === 'crypto' ? '' : '（零股）'}；手續費買、賣各 {fmtRate(costs.feeRate)}
        {costs.sellTaxRate > 0 ? `，賣出另收 ${fmtRate(costs.sellTaxRate)} 交易稅` : ''}（不含最低收費）；賣出拿回的錢放著不動，不計利息、也不再投入
        {asset.market === 'crypto' ? '' : '；股票用還原權息的價格，等於配息自動再投入'}。
      </Notice>
      <Notice tone="warn">
        <strong className="font-semibold">這不是投資建議：</strong>
        回測是用過去的價格算的，未來不一定一樣。價格階梯要配合自己的資金和能承受的風險：跌越多買越多，代表跌很久的時候需要準備更多錢。
      </Notice>
    </div>
  );
}

/* ───────── 說明 ───────── */

function DefaultsHelp({ asset }: { asset: AssetConfig }) {
  const base = defaultPlan(asset.id, 1).baseAmount;
  const usd = asset.currency === 'USD';
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-fg">
      {asset.id === 'BTC' ? (
        <li>
          比特幣的預設是一個例子：基準價格 80,000 美元、每週買 100 美元；跌到 70,000、60,000 每週改買 120、150 美元；漲到 90,000、100,000
          只買 50、30 美元；漲到 110,000 以上每週賣出持有的 10%，120,000 以上賣 20%。
        </li>
      ) : (
        <li>
          基準價格是你<strong className="font-semibold">第一次打開這頁時的價格</strong>，取 3 位有效數字（例如 97.15 → 97.2、77,345 → 77,300），之後就存起來，不會每天跟著價格變。往上、往下每 5%
          一階：跌 5%、10% 每期買基準金額的 1.2 倍、1.5 倍；漲 5%、10% 只買 0.5 倍、0.3 倍；漲 15% 以上每期賣出持有的 10%，漲 20% 以上賣 20%。
        </li>
      )}
      <li>
        預設金額（每週 {money(base, asset)}）只是例子。換成自己的資金時，先算每一期要投多少：
        {usd
          ? '例如你有 3 萬美元（約 100 萬台幣），打算花一年（52 週）慢慢投入，3 萬 ÷ 52 ≈ 每週 580 美元。'
          : '例如你有 100 萬元，打算花一年（52 週）慢慢投入，100 萬 ÷ 52 ≈ 每週 19,000 元。'}
        但跌深的時候一期最多會買到 1.5 倍，基本金額最好再少一點（例如{usd ? '每週 450 美元' : '每週 15,000 元'}），才不會錢不夠。
      </li>
      <li>
        只打算花幾週投入（例如一筆錢分 4 週買完）也是一樣的算法：每期基本金額 ≈ 總資金 ÷ 期數，再保守一點。例如 100 萬分 4 週，基本金額大約 20 萬（4 週都碰到 1.2 倍那一階也只要 96
        萬）。期數越少就越接近一次買進，分批「壓低平均成本」的效果也越小，主要的好處是不會全部買在同一天的價格。
      </li>
      <li>決定好之後，把基準金額改成這個數字，其他每一階也照同樣的倍數放大：例如原本是基準 1.5 倍的那一階，就改成新金額的 1.5 倍。</li>
      <li>
        基準價格怎麼選？常見的做法有三種：用現在的價格；用最近幾個月的平均價（例如 60 日均線）；或用最近一年最高價和最低價的中間。選得太高，價格會一直落在「多買」的那幾階；選得太低，會一直「少買」。沒有標準答案：用現在的價格最中性，一開始買基本金額；用均線的話，價格在均線下面時一開始就會多買。選定之後就照著做，不要每天換基準。回測之後看「每一階出現幾次」，確認不會老是停在同一階。
      </li>
      <li>跌得越深，每期買得越多，要預留比較多的現金。下面回測的「價格與每次買賣」圖，下方的柱子就是每一期買了多少。</li>
      <li>反過來，價格一直漲、每期只買一部分的話，最後會剩下現金。事先決定怎麼處理，例如最後一期把剩下的錢買完，或留著等下次回檔，寫進自己的規則裡。</li>
      <li>階梯的價位也可以照自己的想法改，例如用過去一年的高低點或整數關卡；改完會重新回測。</li>
    </ul>
  );
}

function TrendVsDca() {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-fg">
      <li>
        <strong className="font-semibold">順勢操作</strong>（均線、MACD 這類趨勢指標）：想抓到一段上漲。跌勢中先不買、甚至先賣，等趨勢轉好再進場。好處是比較能避開大跌；缺點是常常買在比較高的地方，盤整時也容易被來回洗。
      </li>
      <li>
        <strong className="font-semibold">定期定額、動態定投</strong>：不判斷方向，長期分批買。跌的時候多買一點，是為了把平均成本壓低。前提是相信這個標的長期會往上（例如追蹤大盤的
        ETF），而且手上有足夠的現金撐過很長的下跌；如果標的一直跌下去，就會越買越虧。
      </li>
      <li>兩種沒有誰對誰錯。重要的是先想清楚一筆錢要用哪一種方法、打算放多久，判斷時用同一套規則，不要用定投的理由買、卻用短線的理由賣。</li>
      <li>
        選了定投，還要看 ADX、MACD 這些趨勢指標嗎？定投的重點是不猜時機、照規則買，所以不用因為趨勢指標偏空就延後或停止；網站上其他「再等幾天看看」的提醒（跌破均線、爆量、RSI 超賣）也一樣，是給想抓買賣時機的人參考的。這些指標比較適合拿來了解現在的行情，或用在另外一筆想抓買賣時機的錢。如果真的想參考，請在開始前就寫進規則（例如「ADX 25 以上的下跌趨勢中，跌越多買越多的倍數不要超過 1.5 倍」），不要臨時改。
      </li>
      <li>
        定投也要事先想好什麼時候停下來重新檢查，例如：總虧損超過自己能承受的程度、這筆錢快要用到了、或標的本身出了問題（買個股比買大盤 ETF 更要注意這點；對比特幣來說，像是比特幣網路本身出現嚴重的技術問題，或主要國家的法規大幅改變。交易所倒閉是交易所的風險，不是比特幣本身的問題，但會影響放在那裡的錢。在這個網站上，可以從「回測 → 消息面」看重大事件，從比特幣專屬指標的「算力」看網路有沒有異常）。先寫下來，不要邊跌邊改規則。
      </li>
    </ul>
  );
}

/* ───────── 價格階梯編輯 ───────── */

/** 數字欄位：輸入時不打擾，按 Enter 或離開欄位時才儲存（不合法就還原） */
function NumberInput({
  value,
  onCommit,
  ariaLabel,
  prefix,
  suffix,
  min = 0,
  max,
  allowZero = true,
  className = '',
}: {
  value: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  allowZero?: boolean;
  className?: string;
}) {
  const shown = fmtNum(value, Number.isInteger(value) ? 0 : 2);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    const v = Number(text.replace(/[,\s]/g, ''));
    const ok = Number.isFinite(v) && v >= min && (max === undefined || v <= max) && (allowZero || v > 0);
    if (ok && v !== value) onCommit(v);
    else setText(shown);
  };
  return (
    <span className={`inline-flex items-center rounded-lg border border-line bg-surface-2 px-2 focus-within:border-accent ${className}`}>
      {prefix && <span className="mr-1 shrink-0 text-xs text-muted">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        onFocus={(e) => {
          setEditing(true);
          setText(String(value));
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-full min-w-0 bg-transparent py-1 text-right text-sm text-fg tabular outline-none"
      />
      {suffix && <span className="ml-1 shrink-0 text-xs text-muted">{suffix}</span>}
    </span>
  );
}

function switchKind(a: DcaAction, kind: string, plan: DcaPlan): DcaAction {
  if (kind === a.kind) return a;
  if (kind === 'buy') return { kind: 'buy', amount: plan.baseAmount };
  if (kind === 'sell') return { kind: 'sell', pct: 10 };
  return { kind: 'hold' };
}

function RuleRow({
  rule,
  plan,
  asset,
  current,
  dup,
  onChange,
  onDelete,
}: {
  rule: LadderRule;
  plan: DcaPlan;
  asset: AssetConfig;
  current: boolean;
  dup: boolean;
  onChange: (r: LadderRule) => void;
  onDelete: () => void;
}) {
  const below = isBelow(plan, rule);
  const same = !below && !isAbove(plan, rule);
  const a = rule.action;
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-2.5 py-2 ${current ? 'border-accent bg-accent/10' : 'border-line'}`}>
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-xs text-muted">{below ? '跌到' : '漲到'}</span>
        <NumberInput value={rule.price} allowZero={false} ariaLabel="價格" onCommit={(v) => onChange({ ...rule, price: v })} className="w-28" />
        <span className="shrink-0 text-xs text-muted">{below ? '以下' : '以上'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <select
          value={a.kind}
          aria-label="要做什麼"
          onChange={(e) => onChange({ ...rule, action: switchKind(a, e.target.value, plan) })}
          className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-sm text-fg"
        >
          <option value="buy">買</option>
          <option value="sell">賣出</option>
          <option value="hold">不動</option>
        </select>
        {a.kind === 'buy' && (
          <NumberInput value={a.amount} prefix={asset.currencySymbol} ariaLabel="金額" onCommit={(v) => onChange({ ...rule, action: { kind: 'buy', amount: v } })} className="w-28" />
        )}
        {a.kind === 'sell' && (
          <>
            <span className="text-xs text-muted">持有的</span>
            <NumberInput value={a.pct} suffix="%" max={100} allowZero={false} ariaLabel="賣出比例" onCommit={(v) => onChange({ ...rule, action: { kind: 'sell', pct: v } })} className="w-20" />
          </>
        )}
        <button type="button" onClick={onDelete} aria-label="刪除這一階" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg">
          <CloseIcon width={16} height={16} />
        </button>
      </div>
      {current && <span className="text-xs font-medium text-accent">← 現在在這一階</span>}
      {same && <span className="w-full text-xs text-hot">和基準價格一樣，這一階不會用到</span>}
      {dup && <span className="w-full text-xs text-hot">有兩階的價格一樣，只會用到其中一階</span>}
    </li>
  );
}

/** 往外加一階：沿用最外面兩階的間距（沒有就用基準價格的 10%） */
function nextRule(plan: DcaPlan, side: 'below' | 'above'): LadderRule {
  const own = plan.rules.filter((r) => (side === 'below' ? isBelow(plan, r) : isAbove(plan, r))).sort((a, b) => a.price - b.price);
  const outer = side === 'below' ? own[0] : own[own.length - 1];
  const inner = side === 'below' ? (own[1]?.price ?? plan.basePrice) : (own[own.length - 2]?.price ?? plan.basePrice);
  const gap = outer ? Math.abs(inner - outer.price) || plan.basePrice * 0.1 : plan.basePrice * 0.1;
  if (side === 'below') {
    const from = outer?.price ?? plan.basePrice;
    const price = nice(Math.max(from - gap, from * 0.5));
    const amount = outer?.action.kind === 'buy' ? Math.round(outer.action.amount * 1.25) : Math.round(plan.baseAmount * 1.2);
    return { price, action: { kind: 'buy', amount } };
  }
  const from = outer?.price ?? plan.basePrice;
  const pct = outer?.action.kind === 'sell' ? Math.min(100, outer.action.pct + 10) : 10;
  return { price: nice(from + gap), action: { kind: 'sell', pct } };
}

function LadderEditor({
  plan,
  asset,
  nowPrice,
  onChange,
  onReset,
}: {
  plan: DcaPlan;
  asset: AssetConfig;
  nowPrice: number;
  onChange: (p: DcaPlan) => void;
  onReset: (() => void) | null;
}) {
  const nowZone = zoneAt(plan, nowPrice).ruleIndex;
  const order = plan.rules.map((r, i) => ({ r, i })).sort((a, b) => b.r.price - a.r.price);
  const upper = order.filter(({ r }) => r.price >= plan.basePrice);
  const lower = order.filter(({ r }) => r.price < plan.basePrice);
  const counts = new Map<number, number>();
  for (const r of plan.rules) counts.set(r.price, (counts.get(r.price) ?? 0) + 1);
  const setRule = (i: number, r: LadderRule) => onChange({ ...plan, rules: plan.rules.map((x, j) => (j === i ? r : x)) });
  const delRule = (i: number) => onChange({ ...plan, rules: plan.rules.filter((_, j) => j !== i) });
  const add = (side: 'below' | 'above') => onChange({ ...plan, rules: [...plan.rules, nextRule(plan, side)] });
  const full = plan.rules.length >= MAX_RULES;
  const row = ({ r, i }: { r: LadderRule; i: number }) => (
    <RuleRow
      key={i}
      rule={r}
      plan={plan}
      asset={asset}
      current={nowZone === i}
      dup={(counts.get(r.price) ?? 0) > 1}
      onChange={(x) => setRule(i, x)}
      onDelete={() => delRule(i)}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="mb-1 text-xs text-muted">基準價格</div>
          <NumberInput value={plan.basePrice} allowZero={false} ariaLabel="基準價格" onCommit={(v) => onChange({ ...plan, basePrice: v })} className="w-36" />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">多久看一次價格</div>
          <Segmented<Cadence>
            size="sm"
            value={plan.cadence}
            onChange={(c) => onChange({ ...plan, cadence: c })}
            ariaLabel="多久一次"
            options={CADENCES.map((c) => ({ value: c, label: CADENCE_LABELS[c] }))}
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">賣出方式</div>
          <Segmented<SellMode>
            size="sm"
            value={plan.sellMode}
            onChange={(m) => onChange({ ...plan, sellMode: m })}
            ariaLabel="賣出方式"
            options={(['every', 'once'] as const).map((m) => ({ value: m, label: SELL_MODE_LABELS[m] }))}
          />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        基準價格以上的價位是「漲到」，以下的是「跌到」。{SELL_MODE_HELP[plan.sellMode]}
      </p>

      <ol className="space-y-1.5">
        {upper.map(row)}
        <li
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-dashed px-2.5 py-2 ${nowZone < 0 ? 'border-accent bg-accent/10' : 'border-line'}`}
        >
          <div className="flex items-center gap-1.5 text-sm">
            <span className="shrink-0 text-xs text-muted">基準區間</span>
            <span className="text-fg">{baseZoneText(plan, asset)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-fg">買</span>
            <NumberInput value={plan.baseAmount} prefix={asset.currencySymbol} ariaLabel="基本金額" onCommit={(v) => onChange({ ...plan, baseAmount: v })} className="w-28" />
            <span className="text-xs text-muted">（基本金額）</span>
          </div>
          {nowZone < 0 && <span className="text-xs font-medium text-accent">← 現在在這一階</span>}
        </li>
        {lower.map(row)}
      </ol>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={full}
          onClick={() => add('above')}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:bg-surface-2 disabled:opacity-50"
        >
          ＋ 往上加一階
        </button>
        <button
          type="button"
          disabled={full}
          onClick={() => add('below')}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:bg-surface-2 disabled:opacity-50"
        >
          ＋ 往下加一階
        </button>
        {onReset && (
          <button type="button" onClick={onReset} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            還原成預設
          </button>
        )}
      </div>
      {full && <p className="text-xs text-muted">最多 {MAX_RULES} 階。</p>}
    </div>
  );
}

/* ───────── 回測結果 ───────── */

function Compare({ cols, asset, candles }: { cols: { title: string; sub: string; r: DcaResult }[]; asset: AssetConfig; candles: Candle[] }) {
  const m = (v: number) => money(v, asset);
  const rows: { label: string; get: (r: DcaResult) => ReactNode }[] = [
    { label: '總共投入', get: (r) => m(r.invested) },
    { label: '賣出拿回', get: (r) => (r.cashOut > 0 ? m(r.cashOut) : '—') },
    { label: '期末持有', get: (r) => unitsText(r.units, asset) },
    { label: '持有的價值', get: (r) => m(r.holdingValue) },
    { label: '總價值（持有＋拿回）', get: (r) => m(r.totalValue) },
    {
      label: '損益',
      get: (r) => (
        <span className={signClass(r.profit)}>
          {r.profit > 0 ? '+' : ''}
          {m(r.profit)}
        </span>
      ),
    },
    { label: '報酬率', get: (r) => <span className={signClass(r.returnPct)}>{fmtPct(r.returnPct)}</span> },
    { label: '年化報酬（XIRR）', get: (r) => (r.xirr === null ? '—' : <span className={signClass(r.xirr)}>{fmtPct(r.xirr)}</span>) },
    { label: '平均買進成本', get: (r) => (r.avgCost === null ? '—' : fmtPrice(r.avgCost, asset)) },
    {
      label: '帳面最差的時候',
      get: (r) =>
        r.worst ? (
          <>
            <span className={signClass(r.worst.pct)}>{fmtPct(r.worst.pct)}</span>
            <div className="text-[11px] text-muted">{fmtDate(candles[r.worst.index]!.time)}</div>
          </>
        ) : (
          '—'
        ),
    },
    { label: '買進／賣出次數', get: (r) => `${r.buys}／${r.sells}` },
    { label: '單期最多投入', get: (r) => m(r.maxBuy) },
  ];
  return (
    <div className="table-scroll">
      <table className="w-full text-xs tabular sm:text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 pr-2 font-normal" />
            {cols.map((c) => (
              <th key={c.title} className="py-1 pr-2 text-right align-bottom font-normal last:pr-0">
                <div className="font-medium text-fg">{c.title}</div>
                {c.sub && <div className="text-[11px]">{c.sub}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-line">
              <td className="py-1.5 pr-2 text-muted">{row.label}</td>
              {cols.map((c) => (
                <td key={c.title} className="py-1.5 pr-2 text-right text-fg last:pr-0">
                  {row.get(c.r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortAction(a: DcaAction, asset: AssetConfig): string {
  if (a.kind === 'buy') return a.amount > 0 ? `買 ${money(a.amount, asset)}` : '不買';
  if (a.kind === 'sell') return `賣 ${fmtNum(a.pct, Number.isInteger(a.pct) ? 0 : 1)}%`;
  return '不動';
}

function DcaChart({ candles, start, end, plan, dyn, asset }: { candles: Candle[]; start: number; end: number; plan: DcaPlan; dyn: DcaResult; asset: AssetConfig }) {
  const slice = useMemo(() => candles.slice(start, end + 1), [candles, start, end]);
  const indicators = useMemo<ChartIndicator[]>(() => {
    const amounts: (number | null)[] = new Array(slice.length).fill(null);
    for (const e of dyn.events) if (e.kind === 'buy') amounts[e.index - start] = e.cash;
    const color = (r: LadderRule): ColorRole => (r.action.kind === 'sell' ? 'hot' : isBelow(plan, r) ? 'cold' : 'muted');
    return [
      {
        key: 'ladder',
        title: '價格階梯',
        placement: 'overlay',
        result: {
          lines: [],
          priceLevels: [
            { value: plan.basePrice, label: '基準', color: 'accent' },
            ...plan.rules.filter((r) => r.price !== plan.basePrice).map((r) => ({ value: r.price, label: shortAction(r.action, asset), color: color(r) })),
          ],
        },
      },
      {
        key: 'amount',
        title: '每期買進金額',
        placement: 'pane',
        result: { lines: [{ key: 'amt', label: '買進', values: amounts, kind: 'histogram', color: 'accent', unit: 'money' }] },
      },
    ];
  }, [slice, dyn, plan, asset, start]);
  const markers = useMemo<ChartMarker[]>(() => {
    const sells = dyn.events.filter((e) => e.kind === 'sell');
    // 賣出次數多時（例如每期都賣）只畫箭頭，文字擠在一起反而看不清楚
    const withText = sells.length <= 8;
    return sells.map((e) => {
      const a = plan.rules[e.ruleIndex]?.action;
      return { index: e.index - start, side: 'sell' as const, text: withText && a?.kind === 'sell' ? `賣 ${fmtNum(a.pct, 0)}%` : '' };
    });
  }, [dyn, plan, start]);
  return (
    <PriceChart
      candles={slice}
      asset={asset}
      indicators={indicators}
      markers={markers}
      visibleBars={slice.length}
      rangeKey={`dca|${asset.id}|${slice[0]?.time}|${slice[slice.length - 1]?.time}`}
    />
  );
}

function ValueChart({ candles, dyn, plain, asset }: { candles: Candle[]; dyn: DcaResult; plain: DcaResult; asset: AssetConfig }) {
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const t = getChartTheme(theme, colorMode);
  const lines = useMemo<LineSpec[]>(() => {
    const pts = (vals: number[]) => vals.map((v, k) => ({ time: candles[dyn.start + k]!.time, value: v }));
    return [
      { key: 'pv', label: '一般定投：總價值', color: t.textMuted, width: 2, points: pts(plain.valueSeries) },
      { key: 'pi', label: '一般定投：累計投入', color: t.textMuted, width: 1, dashed: true, showLastValue: false, points: pts(plain.investedSeries) },
      { key: 'dv', label: '動態定投：總價值', color: t.accent, width: 2, points: pts(dyn.valueSeries) },
      { key: 'di', label: '動態定投：累計投入', color: t.accent, width: 1, dashed: true, showLastValue: false, points: pts(dyn.investedSeries) },
    ];
  }, [candles, dyn, plain, t.textMuted, t.accent]);
  const format = useCallback((v: number) => money(v, asset), [asset]);
  return (
    <>
      <LineChart lines={lines} height={260} format={format} />
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

function ZoneTable({ plan, dyn, asset }: { plan: DcaPlan; dyn: DcaResult; asset: AssetConfig }) {
  const order = plan.rules.map((r, i) => ({ r, i })).sort((a, b) => b.r.price - a.r.price);
  const rows = [
    ...order.filter(({ r }) => isAbove(plan, r)).map(({ r, i }) => ({ key: i, zone: conditionText(r, plan, asset), action: actionText(r.action, plan, asset) })),
    { key: -1, zone: `${baseZoneText(plan, asset)}（基準區間）`, action: actionText({ kind: 'buy', amount: plan.baseAmount }, plan, asset) },
    ...order.filter(({ r }) => isBelow(plan, r)).map(({ r, i }) => ({ key: i, zone: conditionText(r, plan, asset), action: actionText(r.action, plan, asset) })),
  ];
  return (
    <div className="table-scroll">
      <table className="w-full min-w-[420px] text-sm tabular">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 pr-2 font-normal">價格</th>
            <th className="py-1 pr-2 font-normal">做什麼</th>
            <th className="py-1 pr-2 text-right font-normal">次數</th>
            <th className="py-1 text-right font-normal">比例</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => {
            const c = dyn.zoneCounts.get(x.key) ?? 0;
            return (
              <tr key={x.key} className="border-t border-line">
                <td className="py-1.5 pr-2 text-fg">{x.zone}</td>
                <td className="py-1.5 pr-2 text-muted">{x.action}</td>
                <td className="py-1.5 pr-2 text-right text-fg">{c}</td>
                <td className="py-1.5 text-right text-muted">{dyn.periods ? fmtPct(c / dyn.periods, 0, false) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const LOG_LIMIT = 200;

function EventTable({ plan, dyn, candles, asset }: { plan: DcaPlan; dyn: DcaResult; candles: Candle[]; asset: AssetConfig }) {
  const events = dyn.events.slice(-LOG_LIMIT).reverse();
  return (
    <>
      {dyn.events.length > LOG_LIMIT && <p className="mb-2 text-xs text-muted">只列出最近 {LOG_LIMIT} 筆。</p>}
      <div className="table-scroll max-h-[420px] overflow-y-auto">
        <table className="w-full min-w-[480px] text-sm tabular">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-2 font-normal">日期</th>
              <th className="py-1 pr-2 text-right font-normal">價格</th>
              <th className="py-1 pr-2 font-normal">動作</th>
              <th className="py-1 pr-2 text-right font-normal">金額</th>
              <th className="py-1 text-right font-normal">之後持有</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const a = plan.rules[e.ruleIndex]?.action;
              const what = e.kind === 'buy' ? '買進' : `賣出${a?.kind === 'sell' ? ` ${fmtNum(a.pct, 0)}%` : ''}`;
              return (
                <tr key={`${e.index}-${e.kind}-${e.ruleIndex}`} className="border-t border-line">
                  <td className="py-1.5 pr-2 text-fg">{fmtDate(candles[e.index]!.time)}</td>
                  <td className="py-1.5 pr-2 text-right text-muted">{fmtPrice(e.price, asset)}</td>
                  <td className={`py-1.5 pr-2 ${e.kind === 'sell' ? 'text-hot' : 'text-fg'}`}>{what}</td>
                  <td className="py-1.5 pr-2 text-right text-fg">{e.kind === 'buy' ? money(e.cash, asset) : `+${money(e.cash, asset)}`}</td>
                  <td className="py-1.5 text-right text-muted">{unitsText(e.holdings, asset)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
