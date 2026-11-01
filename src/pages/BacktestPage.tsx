import { useEffect, useMemo, useState } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { LineChart, type LineSpec } from '../components/chart/LineChart';
import { PriceChart, type ChartIndicator, type ChartMarker } from '../components/chart/PriceChart';
import { ExplainSheet } from '../components/ExplainSheet';
import { ParamEditor } from '../components/ParamEditor';
import { Card, Notice, PageTitle, Segmented } from '../components/ui';
import { DEFAULT_ASSET_ID, getAsset, type AssetConfig } from '../config/assets';
import type { BacktestConfig, Trade } from '../backtest/engine';
import { defaultCosts, PERIOD_LABELS, runIndicatorBacktest, type PeriodKey } from '../backtest/strategies';
import { summarizeBacktest } from '../backtest/summary';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice, signClass } from '../data/format';
import { useAsset } from '../data/load';
import type { AssetSeries } from '../data/types';
import { getIndicator, indicatorsByCategory } from '../indicators/registry';
import { CATEGORY_LABELS, type IndicatorDef, type Params } from '../indicators/types';
import { Link, navigate, useLocation, withQuery } from '../router';
import { useResolvedTheme, useSettings } from '../store/settings';
import { getChartTheme } from '../theme';

const PERIODS: PeriodKey[] = ['1Y', '3Y', '5Y', '10Y', 'ALL'];

export function BacktestPage() {
  const { query } = useLocation();
  const lastAsset = useSettings((s) => s.lastAsset);
  const asset = getAsset(query.get('asset')) ?? getAsset(lastAsset) ?? getAsset(DEFAULT_ASSET_ID)!;
  const def = getIndicator(query.get('strategy'));
  const strategyDef = def && def.strategy ? def : getIndicator('ma-cross')!;
  const period = (PERIODS as string[]).includes(query.get('period') ?? '') ? (query.get('period') as PeriodKey) : '10Y';
  const state = useAsset(asset.id);

  const go = (patch: { asset?: string; strategy?: string; period?: string }) =>
    navigate(
      withQuery('/backtest', {
        asset: patch.asset ?? asset.id,
        strategy: patch.strategy ?? strategyDef.id,
        period: patch.period ?? period,
      }),
      { replace: true },
    );

  return (
    <div>
      <PageTitle sub="把指標的經典買賣規則套用在過去的真實價格上，看看結果如何，並和「買了一直抱著」比較。">回測</PageTitle>
      <div className="mb-4">
        <AssetTabs value={asset.id} onChange={(id) => go({ asset: id })} />
      </div>
      {state.status === 'ready' ? (
        <BacktestView
          key={asset.id}
          asset={asset}
          series={state.data}
          def={strategyDef}
          period={period}
          onStrategy={(id) => go({ strategy: id })}
          onPeriod={(p) => go({ period: p })}
        />
      ) : (
        <AssetStateView state={state} name={asset.name} />
      )}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step,
  suffix,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  suffix?: string;
  min?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <span className="mt-1 flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= min) onChange(v);
          }}
          className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg tabular"
        />
        {suffix && <span className="shrink-0 text-xs text-muted">{suffix}</span>}
      </span>
    </label>
  );
}

const METRIC_HELP: Record<string, string> = {
  final: '一開始投入的本金，到期末變成多少（期末仍持有的部位以收盤價計算，未扣賣出成本）。',
  total: '整段期間賺（賠）了多少 %。',
  cagr: '把總報酬換算成「平均每年」的複利報酬，方便比較不同長度的期間。期間不到半年時不計算。',
  mdd: '資產從最高點最多跌掉了多少。這是過程中最痛苦的時刻，很多人在這時候放棄策略。',
  vol: '每天漲跌的幅度換算成一年，越大代表過程越顛簸。',
  sharpe: '每承擔一單位波動換到多少報酬（這裡沒有扣除無風險利率），越高代表報酬越有效率。',
  trades: '完成（買進後又賣出）的交易筆數，不含期末仍持有的部位。',
  win: '賺錢的交易占幾 %。勝率高不代表賺錢，還要看每次賺多少、賠多少。',
  avg: '每筆交易的平均報酬（已扣費用）。',
  hold: '每筆交易平均持有幾天（日曆天）。',
  exposure: '有持股的時間占整段期間的比例；其他時間持有現金（這裡不計利息）。',
};

function MetricRow({ id, label, a, b }: { id: string; label: string; a: string; b: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-line">
        <td className="py-2 pr-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-left text-fg underline decoration-dotted underline-offset-4">
            {label}
          </button>
        </td>
        <td className="py-2 pr-2 text-right text-fg">{a}</td>
        <td className="py-2 text-right text-muted">{b}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3} className="pb-2 text-xs leading-relaxed text-muted">
            {METRIC_HELP[id]}
          </td>
        </tr>
      )}
    </>
  );
}

function BacktestView({
  asset,
  series,
  def,
  period,
  onStrategy,
  onPeriod,
}: {
  asset: AssetConfig;
  series: AssetSeries;
  def: IndicatorDef;
  period: PeriodKey;
  onStrategy: (id: string) => void;
  onPeriod: (p: PeriodKey) => void;
}) {
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const t = getChartTheme(theme, colorMode);
  const [cfg, setCfg] = useState<BacktestConfig>(() => defaultCosts(asset));
  const [params, setParams] = useState<Params | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [explain, setExplain] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [logScale, setLogScale] = useState(asset.market === 'crypto');
  useEffect(() => setParams(null), [def.id]);

  const res = useMemo(() => runIndicatorBacktest(series, asset, def, params, period, cfg), [series, asset, def, params, period, cfg]);
  const summary = useMemo(() => summarizeBacktest(res, asset, def.strategy!.name), [res, asset, def]);
  const m = res.metrics;
  const b = res.benchmarkMetrics;
  const s = res.stats;

  const equityLines = useMemo<LineSpec[]>(
    () => [
      { key: 'bh', label: '買進持有', color: t.textMuted, width: 1, points: res.benchmark },
      { key: 'st', label: '策略', color: t.accent, width: 2, points: res.equity },
    ],
    [res, t.textMuted, t.accent],
  );
  const chartIndicators = useMemo<ChartIndicator[]>(
    () => [{ key: def.id, result: res.computed.result, placement: def.placement }],
    [res, def],
  );
  const markers = useMemo<ChartMarker[]>(
    () =>
      res.trades.flatMap((tr) => [
        { index: tr.entryIndex, side: 'buy' as const },
        ...(tr.exitIndex !== null ? [{ index: tr.exitIndex, side: 'sell' as const }] : []),
      ]),
    [res],
  );
  const trades = [...res.trades].reverse();
  const shownTrades = showAll ? trades : trades.slice(0, 15);
  const money = (v: number) => fmtMoney(v, asset);
  const pct = (v: number | null) => fmtPct(v);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block">
              <span className="text-xs text-muted">策略（指標的經典規則）</span>
              <select
                value={def.id}
                onChange={(e) => onStrategy(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg"
              >
                {indicatorsByCategory().map((g) => {
                  const items = g.items.filter((d) => d.strategy);
                  if (!items.length) return null;
                  return (
                    <optgroup key={g.category} label={CATEGORY_LABELS[g.category]}>
                      {items.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}：{d.strategy!.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
            <p className="mt-2 text-sm leading-relaxed text-fg">
              <span className="text-up">買：</span>
              {def.strategy!.buyRule}
              <br />
              <span className="text-down">賣：</span>
              {def.strategy!.sellRule}
            </p>
            <div className="mt-2 flex gap-3 text-sm">
              <button type="button" onClick={() => setEditOpen(true)} className="text-accent">
                調整參數{params ? '（已自訂）' : ''}
              </button>
              <button type="button" onClick={() => setExplain(true)} className="text-accent">
                這個指標是什麼？
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted">回測期間</span>
              <div className="mt-1">
                <Segmented<PeriodKey>
                  size="sm"
                  value={period}
                  onChange={onPeriod}
                  options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
                />
              </div>
            </div>
            <details className="rounded-lg border border-line px-3 py-2">
              <summary className="cursor-pointer text-sm text-fg">本金與交易成本</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumberInput
                  label={`本金（${asset.currency}）`}
                  value={cfg.initialCapital}
                  step={1000}
                  min={100}
                  onChange={(v) => setCfg({ ...cfg, initialCapital: v })}
                />
                <NumberInput
                  label="手續費率"
                  suffix="%"
                  value={+(cfg.feeRate * 100).toFixed(4)}
                  step={0.01}
                  onChange={(v) => setCfg({ ...cfg, feeRate: v / 100 })}
                />
                <NumberInput label="手續費折扣（1 = 不打折）" value={cfg.feeDiscount} step={0.05} onChange={(v) => setCfg({ ...cfg, feeDiscount: v })} />
                <NumberInput label={`最低手續費（${asset.currency}）`} value={cfg.minFee} step={1} onChange={(v) => setCfg({ ...cfg, minFee: v })} />
                <NumberInput
                  label="賣出交易稅"
                  suffix="%"
                  value={+(cfg.sellTaxRate * 100).toFixed(4)}
                  step={0.01}
                  onChange={(v) => setCfg({ ...cfg, sellTaxRate: v / 100 })}
                />
                <div className="flex items-end">
                  <button type="button" onClick={() => setCfg(defaultCosts(asset))} className="text-sm text-accent">
                    恢復預設
                  </button>
                </div>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted">
                {asset.costs.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-base font-semibold text-fg">白話結論</h2>
        <ul className="space-y-1.5 text-sm leading-relaxed text-fg">
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          回測使用還原權息後的日 K；訊號在收盤確定，隔天開盤成交；只做多、全部資金進出。過去的結果不代表未來。
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-base font-semibold text-fg">績效比較</h2>
          <p className="mb-2 text-xs text-muted">點指標名稱可以看說明。</p>
          <div className="table-scroll">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1 pr-2 text-left font-normal" />
                  <th className="py-1 pr-2 text-right font-normal">策略</th>
                  <th className="py-1 text-right font-normal">買進持有</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow id="final" label="期末資產" a={money(m.finalValue)} b={money(b.finalValue)} />
                <MetricRow id="total" label="總報酬" a={pct(m.totalReturn)} b={pct(b.totalReturn)} />
                <MetricRow id="cagr" label="年化報酬" a={pct(m.cagr)} b={pct(b.cagr)} />
                <MetricRow
                  id="mdd"
                  label="最大回撤"
                  a={`−${fmtNum(m.maxDrawdown * 100, 1)}%`}
                  b={`−${fmtNum(b.maxDrawdown * 100, 1)}%`}
                />
                <MetricRow id="vol" label="年化波動" a={fmtPct(m.volatility, 1, false)} b={fmtPct(b.volatility, 1, false)} />
                <MetricRow id="sharpe" label="夏普值" a={fmtNum(m.sharpe, 2)} b={fmtNum(b.sharpe, 2)} />
                <MetricRow id="trades" label="交易次數" a={`${s.closedCount}`} b="—" />
                <MetricRow id="win" label="勝率" a={fmtPct(s.winRate, 0, false)} b="—" />
                <MetricRow id="avg" label="平均每筆報酬" a={pct(s.avgReturn)} b="—" />
                <MetricRow id="hold" label="平均持有天數" a={s.avgHoldingDays === null ? '—' : `${fmtNum(s.avgHoldingDays, 0)} 天`} b="—" />
                <MetricRow id="exposure" label="持股時間比例" a={fmtPct(s.exposure, 0, false)} b="100%" />
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-fg">資產變化</h2>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
              對數刻度
            </label>
          </div>
          <div className="mb-2 flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-fg">
              <span className="inline-block h-0.5 w-4" style={{ background: t.accent }} />
              策略 {money(m.finalValue)}
            </span>
            <span className="inline-flex items-center gap-1 text-fg">
              <span className="inline-block h-0.5 w-4" style={{ background: t.textMuted }} />
              買進持有 {money(b.finalValue)}
            </span>
          </div>
          <LineChart lines={equityLines} height={260} logScale={logScale} />
          <p className="mt-2 text-xs text-muted">對數刻度下，同樣的「漲跌百分比」看起來一樣高，適合看長期或波動大的標的。</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-base font-semibold text-fg">實際的買賣點</h2>
        <PriceChart
          candles={res.candles}
          asset={asset}
          indicators={chartIndicators}
          markers={markers}
          visibleBars={res.endIndex - res.startIndex + 1}
          rangeKey={`bt|${asset.id}|${period}|${def.id}`}
          compact
        />
        <p className="mt-2 text-xs text-muted">箭頭標在「實際成交」的那一天（訊號出現的隔天開盤）。價格為還原權息後的價格，所以會和券商報價不同。</p>
      </Card>

      <Card>
        <h2 className="mb-2 text-base font-semibold text-fg">交易明細（最新在上）</h2>
        {trades.length === 0 ? (
          <p className="text-sm text-muted">這段期間沒有任何交易。可以換一個期間或策略試試看。</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full min-w-[520px] text-sm tabular">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 pr-2 font-normal">買進</th>
                    <th className="py-1 pr-2 font-normal">賣出</th>
                    <th className="py-1 pr-2 text-right font-normal">報酬（扣費用）</th>
                    <th className="py-1 text-right font-normal">持有</th>
                  </tr>
                </thead>
                <tbody>
                  {shownTrades.map((tr: Trade) => (
                    <tr key={tr.entryIndex} className="border-t border-line">
                      <td className="py-1.5 pr-2 text-fg">
                        {fmtDate(tr.entryTime)} <span className="text-muted">@ {fmtPrice(tr.entryPrice, asset)}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-fg">
                        {tr.open ? (
                          <span className="text-hot">持有中</span>
                        ) : (
                          <>
                            {fmtDate(tr.exitTime)} <span className="text-muted">@ {fmtPrice(tr.exitPrice, asset)}</span>
                          </>
                        )}
                      </td>
                      <td className={`py-1.5 pr-2 text-right ${signClass(tr.returnPct)}`}>{fmtPct(tr.returnPct)}</td>
                      <td className="py-1.5 text-right text-muted">{tr.holdingDays} 天</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {trades.length > 15 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm text-accent">
                {showAll ? '收起' : `顯示全部 ${trades.length} 筆`}
              </button>
            )}
          </>
        )}
      </Card>

      <Notice>
        <strong className="font-semibold">回測的陷阱：</strong>
        把參數一直調到「過去最好看」叫做過度最佳化，未來通常會差很多；交易次數太少的結果運氣成分很大；真實交易還有滑價與心理壓力。
        <Link to="/basics/backtest" className="ml-1 text-accent">
          了解更多
        </Link>
      </Notice>

      <ParamEditor
        def={def}
        market={asset.market}
        custom={params}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onApply={setParams}
      />
      <ExplainSheet id={explain ? def.id : null} onClose={() => setExplain(false)} />
    </div>
  );
}
