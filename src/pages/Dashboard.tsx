import { useMemo, useState } from 'react';
import { AssetTabs } from '../components/AssetTabs';
import { DataTimeNote } from '../components/DataTimeNote';
import { LineChart, type LineSpec } from '../components/chart/LineChart';
import { Sparkline } from '../components/Sparkline';
import { Card, Fold, Notice, PageTitle, Segmented, SectionTitle, Spinner, ToneBadge } from '../components/ui';
import { ASSETS, DEFAULT_ASSET_ID, getAsset, MARKET_LABELS, type AssetConfig } from '../config/assets';
import { equityMetrics, periodsPerYear, type EquityMetrics } from '../backtest/metrics';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtPct, fmtPrice, signClass } from '../data/format';
import { useAssets, useExtra, useManifest, type LoadState } from '../data/load';
import { completedLength } from '../data/parse';
import type { AssetSeries } from '../data/types';
import { computeIndicator, describeOf, indicatorsByCategory } from '../indicators/registry';
import { CATEGORY_LABELS, type IndicatorDef, type StateSummary } from '../indicators/types';
import { Link, withQuery } from '../router';
import { useResolvedTheme, useSettings } from '../store/settings';
import { getChartTheme } from '../theme';

export function Dashboard() {
  const states = useAssets(ASSETS.map((a) => a.id));
  const manifest = useManifest();
  const lastAsset = useSettings((s) => s.lastAsset);
  const [stateAssetId, setStateAssetId] = useState(getAsset(lastAsset)?.id ?? DEFAULT_ASSET_ID);
  const stateAsset = getAsset(stateAssetId)!;
  const st = states[stateAsset.id];
  const problems = manifest?.assets.filter((a) => a.status !== 'ok') ?? [];

  return (
    <div className="space-y-6">
      <PageTitle sub={manifest ? `資料更新：${fmtDateTime(manifest.generatedAt)}（台北時間）· 來源 Yahoo Finance` : '0050、VOO、比特幣的價格與技術指標'}>
        總覽
      </PageTitle>

      <Notice>
        第一次使用？先看
        <Link to="/basics/getting-started" className="mx-1 text-accent">
          5 分鐘入門
        </Link>
        ，了解這個工具能做什麼、建議怎麼學。
      </Notice>

      {problems.length > 0 && (
        <Notice tone="warn">
          {problems.map((p) => `${p.id} 最近一次更新失敗（目前顯示 ${p.lastDate ? fmtDate(p.lastDate) : '—'} 的資料）`).join('；')}。
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {ASSETS.map((a) => (
          <AssetCard key={a.id} asset={a} state={states[a.id]!} />
        ))}
      </div>

      <Card>
        <SectionTitle sub="每個指標用白話描述目前的狀態，參數用各市場常用的設定（例如 RSI：0050 用 6 天，VOO 和比特幣用 14 天），其他頁面用的天數不同時，數字也會不同。指標之間常常意見不一致，這很正常：它們看的面向不同。">
          各指標目前怎麼說
        </SectionTitle>
        <div className="mb-4">
          <AssetTabs value={stateAsset.id} onChange={setStateAssetId} />
        </div>
        <div className="mb-4">
          <Fold title="這些標籤怎麼看？意見不一致時先看哪一個？" sub="偏多、偏空、過熱、過冷是什麼意思，以及各市場為什麼用不同的天數。">
            <StateGuide />
          </Fold>
        </div>
        {st?.status === 'ready' ? (
          <IndicatorStates asset={stateAsset} series={st.data} />
        ) : st?.status === 'loading' || !st ? (
          <Spinner />
        ) : (
          <p className="text-sm text-muted">{st.message}</p>
        )}
      </Card>

      <Card>
        <SectionTitle sub="假設在同一天各投入 100,000（各自的貨幣），之後會變成多少？已含配息。">績效比較</SectionTitle>
        <Comparison states={states} />
      </Card>
    </div>
  );
}

function AssetCard({ asset, state }: { asset: AssetConfig; state: LoadState<AssetSeries> }) {
  if (state.status !== 'ready') {
    return (
      <Card>
        <div className="text-sm font-semibold text-fg">{asset.name}</div>
        {state.status === 'loading' ? <Spinner /> : <p className="mt-2 text-sm text-muted">{state.message}</p>}
      </Card>
    );
  }
  const c = state.data.candles;
  const n = c.length;
  const last = c[n - 1]!;
  const prev = c[n - 2];
  const chg = prev ? last.close / prev.close - 1 : null;
  const spark = c.slice(-120).map((x) => x.close);
  const yearAgo = c.find((x) => x.time >= `${Number(last.time.slice(0, 4)) - 1}${last.time.slice(4)}`);
  const yearChg = yearAgo ? last.close / yearAgo.close - 1 : null;
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted">
            {asset.shortName} · {MARKET_LABELS[asset.market]} · {asset.currency}
          </div>
          <div className="truncate font-semibold text-fg">{asset.name}</div>
        </div>
        <Sparkline values={spark} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-fg tabular">{fmtPrice(last.close, asset)}</span>
        <span className={`text-sm font-medium tabular ${signClass(chg)}`}>{fmtPct(chg)}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        <DataTimeNote series={state.data} compact />
      </div>
      {yearChg !== null && (
        <div className="text-xs text-muted">
          近一年股價 <span className={signClass(yearChg)}>{fmtPct(yearChg, 1)}</span>
          {asset.market !== 'crypto' && '（不含配息）'}
        </div>
      )}
      <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{asset.intro}</p>
      <div className="mt-3 flex gap-4 text-sm">
        <Link to={`/chart/${asset.id}`} className="text-accent">
          看圖表
        </Link>
        <Link to={withQuery('/backtest', { asset: asset.id })} className="text-accent">
          回測
        </Link>
        <Link to={withQuery('/forecast', { asset: asset.id })} className="text-accent">
          走勢預測
        </Link>
      </div>
    </Card>
  );
}

/** 預設只顯示新手最常接觸的幾個指標，避免一次看到 25 個太混亂 */
const FEATURED = ['sma', 'ma-cross', 'macd', 'dmi', 'rsi', 'kd', 'bollinger', 'volume', 'fear-greed'];

function StateItem({ def, d }: { def: IndicatorDef; d: StateSummary | null }) {
  return (
    <li className="text-sm">
      <div className="flex items-center gap-2">
        {d ? <ToneBadge tone={d.tone} /> : <span className="text-xs text-muted">—</span>}
        <Link to={`/learn/${def.id}`} className="font-medium text-fg hover:text-accent">
          {def.name}
        </Link>
      </div>
      {d && (
        <p className="mt-0.5 leading-relaxed text-muted">
          <span className="text-fg">{d.headline}。</span>
          {d.detail}
        </p>
      )}
    </li>
  );
}

function IndicatorStates({ asset, series }: { asset: AssetConfig; series: AssetSeries }) {
  const [showAll, setShowAll] = useState(false);
  const candles = series.candles;
  // 比特幣另外有情緒、合約、鏈上的指標
  const extra = useExtra(asset.id);
  const groups = useMemo(
    () =>
      indicatorsByCategory(asset.id).map((g) => ({
        category: g.category,
        items: g.items.map((def) => ({ def, d: describeOf(computeIndicator(def, candles, asset.market, null, { extra }), candles) })),
      })),
    [candles, asset.market, asset.id, extra],
  );
  const all = groups.flatMap((g) => g.items);
  const featured = FEATURED.flatMap((id) => all.filter((x) => x.def.id === id));
  return (
    <div>
      {showAll ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.category}>
              <h3 className="mb-2 text-sm font-semibold text-muted">{CATEGORY_LABELS[g.category]}</h3>
              <ul className="space-y-2.5">
                {g.items.map((x) => (
                  <StateItem key={x.def.id} {...x} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
          {featured.map((x) => (
            <StateItem key={x.def.id} {...x} />
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="mt-4 rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:border-accent"
      >
        {showAll ? `只看常用的 ${FEATURED.length} 個` : `顯示全部 ${all.length} 個指標`}
      </button>
    </div>
  );
}

type CmpPeriod = '1Y' | '3Y' | '5Y' | 'ALL';
const CMP_YEARS: Record<CmpPeriod, number> = { '1Y': 1, '3Y': 3, '5Y': 5, ALL: Infinity };

function Comparison({ states }: { states: Record<string, LoadState<AssetSeries>> }) {
  const [period, setPeriod] = useState<CmpPeriod>('3Y');
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);

  const result = useMemo(() => {
    const t = getChartTheme(theme, colorMode);
    const ready = ASSETS.flatMap((a) => {
      const s = states[a.id];
      return s?.status === 'ready' ? [{ asset: a, series: s.data }] : [];
    });
    if (ready.length === 0) return null;
    const ends = ready.map(({ series }) => series.candles[completedLength(series) - 1]!.time);
    const firsts = ready.map(({ series }) => series.candles[0]!.time);
    const latest = ends.reduce((a, b) => (a > b ? a : b));
    const years = CMP_YEARS[period];
    const commonFirst = firsts.reduce((a, b) => (a > b ? a : b));
    const cutoff = Number.isFinite(years)
      ? new Date(Date.parse(`${latest}T00:00:00Z`) - years * 365.25 * 86400000).toISOString().slice(0, 10)
      : commonFirst;
    const startDate = cutoff > commonFirst ? cutoff : commonFirst;
    const rows: { asset: AssetConfig; m: EquityMetrics; line: LineSpec }[] = ready.map(({ asset, series }, k) => {
      const n = completedLength(series);
      const times = series.candles.slice(0, n).map((c) => c.time);
      let i0 = times.findIndex((x) => x >= startDate);
      if (i0 < 0) i0 = n - 1;
      const base = series.adjClose[i0]!;
      const points = times.slice(i0).map((time, j) => ({ time, value: (100_000 * series.adjClose[i0 + j]!) / base }));
      return {
        asset,
        m: equityMetrics(points, periodsPerYear(times)),
        line: { key: asset.id, label: asset.shortName, color: t.series[k % t.series.length]!, width: 2 as const, points },
      };
    });
    return { rows, startDate };
  }, [states, period, theme, colorMode]);

  if (!result) return <Spinner />;
  const lines = result.rows.map((r) => r.line);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented<CmpPeriod>
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '1Y', label: '近 1 年' },
            { value: '3Y', label: '近 3 年' },
            { value: '5Y', label: '近 5 年' },
            { value: 'ALL', label: '共同期間' },
          ]}
        />
        <span className="text-xs text-muted">起點：{fmtDate(result.startDate)}</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        {result.rows.map((r) => (
          <span key={r.asset.id} className="inline-flex items-center gap-1 text-fg">
            <span className="inline-block h-0.5 w-4" style={{ background: r.line.color }} />
            {r.asset.shortName === 'BTC' ? '比特幣' : r.asset.shortName}
          </span>
        ))}
      </div>
      <LineChart lines={lines} height={260} logScale={period === 'ALL'} />
      <div className="table-scroll mt-3">
        <table className="w-full min-w-[460px] text-sm tabular">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 pr-2 text-left font-normal">標的</th>
              <th className="py-1 pr-2 text-right font-normal">10 萬變成</th>
              <th className="py-1 pr-2 text-right font-normal">總報酬</th>
              <th className="py-1 pr-2 text-right font-normal">年化</th>
              <th className="py-1 pr-2 text-right font-normal">最大回撤</th>
              <th className="py-1 text-right font-normal">年化波動</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map(({ asset, m }) => (
              <tr key={asset.id} className="border-t border-line">
                <td className="py-1.5 pr-2 text-fg">{asset.shortName}</td>
                <td className="py-1.5 pr-2 text-right text-fg">{fmtMoney(m.finalValue, asset)}</td>
                <td className={`py-1.5 pr-2 text-right ${signClass(m.totalReturn)}`}>{fmtPct(m.totalReturn, 1)}</td>
                <td className="py-1.5 pr-2 text-right text-fg">{fmtPct(m.cagr, 1)}</td>
                <td className="py-1.5 pr-2 text-right text-fg">−{fmtNum(m.maxDrawdown * 100, 1)}%</td>
                <td className="py-1.5 text-right text-fg">{fmtPct(m.volatility, 1, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        各自以原本的貨幣計算（0050 是台幣，VOO 和比特幣是美元），沒有換算匯率。換成台幣時還要加上匯率的變化：同一段期間美元對台幣升值 3%，台幣算的報酬就大約多 3%；美元貶值就少 3%。報酬已含配息再投入。最大回撤是期間內從高點最多跌掉多少，年化波動越大代表過程越顛簸。
        {period === 'ALL' && ' 「共同期間」使用對數刻度，方便比較漲幅差很多的標的。'}
      </p>
    </div>
  );
}

/** 「各指標目前怎麼說」的標籤說明：新手最常問的是過冷是好是壞、意見不一致時該信哪個 */
function StateGuide() {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-fg">
      <li>
        <strong className="font-semibold">偏多、偏空</strong>：這個指標看到「漲的力量」或「跌的力量」比較強。這是在描述現在的狀態，不是買賣建議。
      </li>
      <li>
        <strong className="font-semibold">過熱、過冷</strong>：短期漲（跌）得太多、太快。過冷不代表馬上會漲：跌勢裡可能一直過冷，越跌越冷；過熱也不代表馬上會跌。
      </li>
      <li>
        <strong className="font-semibold">意見不一致時</strong>：先看「趨向指標（DMI／ADX）」判斷現在是趨勢還是盤整。ADX 25 以上代表趨勢明確，這時以均線、MACD、DMI
        這類趨勢指標為主，RSI、KD 的過冷、過熱比較容易失準；ADX 20 以下代表盤整，RSI、KD、布林通道比較有用。詳細的說明在
        <Link to="/basics/trend" className="text-accent">
          「趨勢、盤整與支撐壓力」
        </Link>
        。
      </li>
      <li>
        <strong className="font-semibold">為什麼每個市場的天數不一樣</strong>：照各市場的看盤習慣。均線：0050 用 5、20、60、120、240 日（大約一週、一個月、一季、半年、一年），VOO
        用 20、50、200 日，比特幣用 7、25、99 日（加密貨幣交易所常見的預設）；黃金交叉 0050 看 20 和 60 日，VOO、比特幣看 50 和 200 日。最長的那條代表長期趨勢。RSI：0050 用 6
        天，VOO、比特幣用 14 天。
      </li>
    </ul>
  );
}
