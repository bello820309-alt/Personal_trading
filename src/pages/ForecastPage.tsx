import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { LineChart, type LineSpec } from '../components/chart/LineChart';
import { PriceChart, type ChartIndicator } from '../components/chart/PriceChart';
import { Card, Fold, Notice, PageTitle, Segmented, Spinner } from '../components/ui';
import { DEFAULT_ASSET_ID, getAsset, type AssetConfig } from '../config/assets';
import { FEATURES, analogForecast, horizonsFor, walkForwardCheck, type CheckResult, type Forecast, type HorizonKey } from '../forecast/analog';
import { checkPoints, describeNow, historyTail, similarityNote, summarizeCheck, usageTips, type CheckTone } from '../forecast/summary';
import { fmtDate, fmtNum, fmtPct, fmtPrice, signClass } from '../data/format';
import { useAsset } from '../data/load';
import { completedLength } from '../data/parse';
import { adjustCandles, futureDates } from '../data/resample';
import type { AssetSeries, Candle } from '../data/types';
import { Link, navigate, useLocation, withQuery } from '../router';
import { useResolvedTheme, useSettings } from '../store/settings';
import { getChartTheme, withAlpha } from '../theme';

const H_KEYS: HorizonKey[] = ['1w', '1m', '3m'];
const parseH = (v: string | null): HorizonKey => (H_KEYS.includes(v as HorizonKey) ? (v as HorizonKey) : '1m');

/** 圖上顯示多少根歷史 K 棒：預測的時間越短，歷史也看短一點，右邊的預測範圍才看得清楚 */
const HISTORY_BARS: Record<HorizonKey, number> = { '1w': 60, '1m': 120, '3m': 200 };

export function ForecastPage() {
  const { query } = useLocation();
  const lastAsset = useSettings((s) => s.lastAsset);
  const asset = getAsset(query.get('asset')) ?? getAsset(lastAsset) ?? getAsset(DEFAULT_ASSET_ID)!;
  const hKey = parseH(query.get('h'));
  const state = useAsset(asset.id);
  const go = (patch: { asset?: string; h?: HorizonKey }) => {
    const h = patch.h ?? hKey;
    navigate(withQuery('/forecast', { asset: patch.asset ?? asset.id, h: h === '1m' ? null : h }), { replace: true });
  };
  return (
    <div>
      <PageTitle sub="歷史類比法：在過去的資料裡找出和現在走勢最像的日子，看它們之後怎麼走，推估未來可能的範圍。">走勢預測</PageTitle>
      <div className="mb-3">
        <AssetTabs value={asset.id} onChange={(id) => go({ asset: id })} />
      </div>
      {state.status === 'ready' ? (
        <ForecastView key={asset.id} asset={asset} series={state.data} hKey={hKey} onHorizon={(h) => go({ h })} />
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

function Stat({ label, value, note, valueClass = 'text-fg' }: { label: string; value: string; note: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-xs leading-relaxed text-muted">{note}</div>
    </div>
  );
}

const TONE_DOT: Record<CheckTone, string> = { good: 'bg-accent', meh: 'bg-muted', bad: 'bg-hot' };

const fmtFeature = (kind: string, v: number) => (kind === 'pct' ? fmtPct(v) : kind === 'ratio' ? `${fmtNum(v, 2)} 倍` : fmtNum(v, 1));

/** 預測範圍畫在 K 線右邊（到選定的時間長度為止）：中位數（虛線）、一半的情況（深色）、八成的情況（淺色） */
function coneIndicator(f: Forecast, candles: Candle[], bars: number): ChartIndicator {
  const n = candles.length;
  const price = candles[f.target]!.close;
  const h = Math.min(bars, f.cone.length - 1);
  const line = (pick: (p: Forecast['cone'][number]) => number) => {
    const values: (number | null)[] = new Array(n).fill(null);
    // 第 k 天放在 n-1-h+k，再往未來平移 h 根 → 顯示在最後一根之後的第 k 根。
    // 第 0 天就是現在的價格（五條線都一樣）所以不畫：十字線停在最後一根時，圖例會提示「移到右邊的未來日期」
    for (const p of f.cone) if (p.k > 0 && p.k <= h) values[n - 1 - h + p.k] = price * (1 + pick(p));
    return values;
  };
  return {
    key: 'forecast',
    title: '預測範圍',
    placement: 'overlay',
    result: {
      lines: [
        { key: 'p90', label: '樂觀 90%', values: line((p) => p.p90), kind: 'line', color: 'muted', width: 1, shift: h },
        { key: 'p75', label: '75%', values: line((p) => p.p75), kind: 'line', color: 'accent', width: 1, shift: h },
        { key: 'p50', label: '中位數', values: line((p) => p.p50), kind: 'line', color: 'accent', width: 2, dashed: true, shift: h },
        { key: 'p25', label: '25%', values: line((p) => p.p25), kind: 'line', color: 'accent', width: 1, shift: h },
        { key: 'p10', label: '悲觀 10%', values: line((p) => p.p10), kind: 'line', color: 'muted', width: 1, shift: h },
      ],
      fills: [
        { upper: 'p90', lower: 'p10', color: 'accent', opacity: 0.08 },
        { upper: 'p75', lower: 'p25', color: 'accent', opacity: 0.18 },
      ],
    },
  };
}

function ForecastView({
  asset,
  series,
  hKey,
  onHorizon,
}: {
  asset: AssetConfig;
  series: AssetSeries;
  hKey: HorizonKey;
  onHorizon: (h: HorizonKey) => void;
}) {
  const n = completedLength(series);
  const lastTime = series.candles[n - 1]?.time ?? '';
  const lastClose = series.candles[n - 1]?.close ?? 0;
  // 只用已收盤的 K 棒（還原權息）：比特幣每分鐘更新的即時價格不影響預測，
  // 有新的收盤資料（或收盤價被修正）時才重算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const candles = useMemo(() => adjustCandles(series.candles, series.adjClose).slice(0, n), [n, lastTime, lastClose]);
  const forecast = useMemo(() => analogForecast(candles, asset), [candles, asset]);
  // 回頭檢驗要算幾百次，放到畫面出來之後再算
  const [check, setCheck] = useState<CheckResult[] | null>(null);
  useEffect(() => {
    setCheck(null);
    const id = window.setTimeout(() => setCheck(walkForwardCheck(candles, asset)), 30);
    return () => window.clearTimeout(id);
  }, [candles, asset]);

  const horizons = horizonsFor(asset);
  const hz = horizons.find((h) => h.key === hKey)!;
  const cone = useMemo(() => (forecast ? [coneIndicator(forecast, candles, hz.bars)] : []), [forecast, candles, hz.bars]);
  // 過去 5 年最差的一成（範圍估得太窄時，給新手想最壞情況用）
  const tail = useMemo(() => {
    const t = historyTail(candles.map((c) => c.close), candles.map((c) => c.time), hz.bars);
    return t ? { ...t, span: hz.label.replace(/後$/, '') } : null;
  }, [candles, hz.bars, hz.label]);

  if (!forecast) return <Notice tone="warn">資料不夠長（至少要一年多的日 K），還沒辦法預測。</Notice>;
  const stats = forecast.horizons.find((x) => x.horizon.key === hKey)!.stats;
  const price = candles[forecast.target]!.close;
  const baseDate = candles[forecast.target]!.time;
  const targetDate = futureDates(baseDate, hz.bars, asset.tradesOnWeekends)[hz.bars - 1];
  const span = hz.label.replace(/後$/, '');
  const hc = check?.find((r) => r.horizon.key === hKey) ?? null;
  const ups = Math.round(stats.up * stats.n);
  const dirWeak = hc !== null && checkPoints(hc)[0]!.tone !== 'good';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm text-muted">預測多久之後：</span>
        <Segmented<HorizonKey>
          value={hKey}
          onChange={onHorizon}
          ariaLabel="預測多久之後"
          options={horizons.map((h) => ({ value: h.key, label: h.label.replace(/後$/, '') }))}
        />
        <span className="w-full text-xs text-muted sm:w-auto">依據 {fmtDate(baseDate)} 收盤・每次打開都用最新的資料重新計算</span>
      </div>

      <Card>
        <H2 sub={`從過去的資料裡找出 ${stats.n} 個和現在最像的日子，看它們 ${hz.label}怎麼走。`}>
          {hz.label}（{fmtDate(targetDate)} 左右）
        </H2>
        {similarityNote(forecast, FEATURES) && (
          <div className="mb-3">
            <Notice tone="warn">{similarityNote(forecast, FEATURES)}</Notice>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat
            label="上漲的比例"
            value={fmtPct(stats.up, 0, false)}
            note={
              dirWeak && hc
                ? `${stats.n} 個相似的日子裡有 ${ups} 個上漲。這不是「會漲的機率」：過去用它猜漲跌只猜對 ${fmtPct(hc.hit, 0, false)}，一直猜漲也有 ${fmtPct(hc.alwaysUp, 0, false)}，看看就好`
                : `${stats.n} 個相似的日子裡，有 ${ups} 個上漲`
            }
          />
          <Stat
            label="中位數"
            value={fmtPct(stats.median)}
            valueClass={signClass(stats.median)}
            note={`約 ${fmtPrice(price * (1 + stats.median), asset)}（一半比它高、一半比它低）`}
          />
          <Stat
            label="八成的情況落在"
            value={`${fmtPct(stats.p10)} ～ ${fmtPct(stats.p90)}`}
            note={`約 ${fmtPrice(price * (1 + stats.p10), asset)} ～ ${fmtPrice(price * (1 + stats.p90), asset)}`}
          />
        </div>
        <div className="mt-3 rounded-lg border border-line px-3 py-2">
          <div className="mb-1 text-xs text-muted">這個方法過去準不準？（過去 5 年每週回頭檢驗一次）</div>
          {hc ? (
            <ul className="space-y-1">
              {checkPoints(hc).map((p) => (
                <li key={p.title} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[p.tone]}`} aria-hidden="true" />
                  <span>
                    <span className="font-medium text-fg">{p.title}</span>
                    <span className="text-muted">：{p.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Spinner label="正在檢驗…" />
          )}
          {hc && (
            <div className="mt-2 border-t border-line pt-2 text-sm leading-relaxed">
              <span className="font-medium text-fg">所以怎麼用？</span>
              <span className="text-muted">{usageTips(hc, tail).join('')}</span>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <H2 sub="虛線是中位數，深色是一半的情況（25%～75%），淺色是八成的情況（10%～90%）。十字線移到右邊的未來日期，可以看那天的數字。">
          未來 {span}的可能範圍
        </H2>
        <PriceChart
          candles={candles}
          asset={asset}
          indicators={cone}
          visibleBars={Math.min(candles.length, HISTORY_BARS[hKey])}
          rangeKey={`forecast|${asset.id}|${hKey}`}
        />
      </Card>

      <Fold title="如果歷史重演" sub={`${forecast.paths.length} 個相似的日子之後 ${span}的走勢，換算成現在的價格。起點很像，之後的走法卻差很多。`}>
        <PathsChart forecast={forecast} candles={candles} asset={asset} bars={hz.bars} />
      </Fold>

      <Fold title="現在的狀態，和最像現在的日子" sub="相似的日子是只用價格算出來的數字挑出來的，不包含消息面。">
        <p className="text-sm leading-relaxed text-fg">{describeNow(forecast, candles, asset)}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {similarityNote(forecast, FEATURES)
            ? '下表裡現在和相似日子差很多，所以結果上方有「最像的日子其實也沒有很像」的提醒。'
            : '這次相似的日子和現在大致相像：下表每一項的差距，都在這個特徵歷史上的 1 個標準差以內（差太多時，結果上方會出現提醒）。'}
        </p>
        <div className="table-scroll mt-3">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal">特徵</th>
                <th className="py-1 pr-2 text-right font-normal">現在</th>
                <th className="py-1 text-right font-normal">相似日子的平均</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f, j) => {
                const avg = forecast.analogFeatures.reduce((a, row) => a + row[j]!, 0) / forecast.analogFeatures.length;
                return (
                  <tr key={f.key} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-fg">{f.label}</td>
                    <td className="py-1.5 pr-2 text-right text-fg">{fmtFeature(f.kind, forecast.features[j]!)}</td>
                    <td className="py-1.5 text-right text-muted">{fmtFeature(f.kind, avg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          這頁的特徵每個標的都用一樣的設定，才能互相比較：RSI 固定 14 天、均線固定 200 日。總覽和圖表用的是各市場常用的設定
          {asset.market === 'tw'
            ? '（0050 的 RSI 用 6 天、最長的均線是 MA240），所以數字不一樣：例如「和 200 日均線的距離」和總覽的「距離 MA240」是在比不同的均線。如果價格剛好夾在這兩條長期均線中間（一條在上、一條在下），代表正在長期均線附近，長期方向還要再觀察，可以看總覽寫的均線往哪邊彎。'
            : asset.market === 'crypto'
              ? '（比特幣最長的均線是 MA99），所以「和 200 日均線的距離」和總覽的「距離 MA99」是在比不同的均線。'
              : '（VOO 也是 RSI 14 天、MA200），所以只會差一點點。'}
          {asset.market !== 'crypto' && '另外這頁用還原權息的價格計算（把配息加回去，漲跌才完整），總覽和圖表預設不還原，也會讓數字有一點點不同。'}
        </p>
        <h3 className="mt-4 mb-2 text-sm font-semibold text-fg">最像現在的 10 個日子</h3>
        <div className="table-scroll">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal">#</th>
                <th className="py-1 pr-2 font-normal">日期</th>
                <th className="py-1 pr-2 text-right font-normal">當時近 1 個月</th>
                <th className="py-1 text-right font-normal">之後 {span}</th>
              </tr>
            </thead>
            <tbody>
              {forecast.analogs.slice(0, 10).map((a, i) => {
                const r = forecast.paths[i]![hz.bars]!;
                return (
                  <tr key={a.index} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-muted">{i + 1}</td>
                    <td className="py-1.5 pr-2 text-fg">{fmtDate(candles[a.index]!.time)}</td>
                    <td className={`py-1.5 pr-2 text-right ${signClass(forecast.analogFeatures[i]![2])}`}>{fmtPct(forecast.analogFeatures[i]![2])}</td>
                    <td className={`py-1.5 text-right ${signClass(r)}`}>{fmtPct(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Fold>

      <Fold title="回頭檢驗的詳細結果" sub="假裝站在過去的某一天，只用當時已經知道的資料預測，再和後來真正發生的事比對。">
        {check && hc ? (
          <>
            <Lines lines={summarizeCheck(hc)} />
            <div className="table-scroll mt-3">
              <table className="w-full text-sm tabular">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 pr-2 font-normal" />
                    <th className="py-1 pr-2 text-right font-normal">檢驗次數</th>
                    <th className="py-1 pr-2 text-right font-normal">猜對漲跌</th>
                    <th className="py-1 pr-2 text-right font-normal">一直猜「漲」</th>
                    <th className="py-1 text-right font-normal">落在八成範圍</th>
                  </tr>
                </thead>
                <tbody>
                  {check.map((r) => (
                    <tr key={r.horizon.key} className={`border-t border-line ${r.horizon.key === hKey ? 'bg-surface-2' : ''}`}>
                      <td className="whitespace-nowrap py-1.5 pr-2 text-fg">{r.horizon.label}</td>
                      <td className="py-1.5 pr-2 text-right text-muted">{r.tests}</td>
                      <td className={`py-1.5 pr-2 text-right ${r.hit > r.alwaysUp + 0.03 ? 'text-accent' : 'text-fg'}`}>{fmtPct(r.hit, 0, false)}</td>
                      <td className="py-1.5 pr-2 text-right text-muted">{fmtPct(r.alwaysUp, 0, false)}</td>
                      <td className="py-1.5 text-right text-fg">{fmtPct(r.coverage, 0, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              「一直猜漲」是最簡單的對照：長期上漲的標的，每次都猜漲就能猜對一半以上，預測方法至少要贏過它才算有用。「落在八成範圍」越接近
              80%，代表範圍估得越準。
            </p>
          </>
        ) : (
          <Spinner label="正在回頭檢驗（每週一次、約 5 年）…" />
        )}
      </Fold>

      <Fold title="這是怎麼算的？" sub="歷史類比法（Analog Forecasting）／相似走勢比對／k 最近鄰（k-NN）">
        <div className="space-y-2 text-sm leading-relaxed text-fg">
          <p>
            這種方法叫做<strong>「歷史類比法」</strong>（Analog Forecasting），也有人叫「相似走勢比對」或「相似 K 線」；在機器學習裡，它就是
            <strong>「k 最近鄰」</strong>（k-NN）。早年的天氣預報也用過同樣的想法：找出過去天氣型態最像今天的日子，看那些日子隔天的天氣。
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>用 9 個數字描述每一天的狀態：最近 1 週、2 週、1 個月、2 個月、3 個月的漲跌，和 200 日均線的距離，RSI，最近的波動和過去一年比，以及離一年內最高點多遠。</li>
            <li>把每個數字換成「標準分數」，讓不同單位的數字可以放在一起比較，再算出每一天和「現在」差多少。</li>
            <li>挑出最接近的 30 天，而且彼此至少相隔 1 個月，避免同一段行情被重複計算、讓結果看起來比實際更有把握。</li>
            <li>看這 30 天之後 1 週、1 個月、3 個月的漲跌，整理成上漲的比例、中位數與可能範圍。</li>
          </ol>
          <p>全部都是程式用最新的資料當場算出來的，沒有任何寫死的數字；資料更新後，打開這一頁就會用新的資料重算。</p>
          <p>為什麼最多只看 3 個月？時間拉得越長，相似的日子越少、市場的環境也差越多；1 週以內又幾乎都是隨機的雜訊。</p>
          <p className="text-muted">
            限制：它只看價格的形狀和位置，不知道消息面（例如 FOMC、ETF 核准）；市場的結構會改變（例如比特幣 2015 年和現在的參與者完全不同）；資料只有十幾年，真正相似的情況並不多。過去的統計不代表未來。
          </p>
          <p>
            想看消息面：
            <Link to={withQuery('/backtest/events', { asset: asset.id })} className="text-accent">
              回測 → 消息面
            </Link>
            ；想看哪些技術指標在過去比較好用：
            <Link to={withQuery('/backtest/rank', { asset: asset.id })} className="ml-1 text-accent">
              策略排行榜
            </Link>
            。
          </p>
        </div>
      </Fold>

      <Notice tone="warn">
        <strong className="font-semibold">這不是投資建議：</strong>
        這個頁面是讓你了解「如果歷史重演，可能的範圍有多大」，以及「預測未來有多難」。實際走勢可能完全不同，請不要只依照這裡的數字買賣。
      </Notice>
    </div>
  );
}

/** 每個相似日子之後的走勢（換算成現在的價格）＋中位數 */
function PathsChart({ forecast, candles, asset, bars }: { forecast: Forecast; candles: Candle[]; asset: AssetConfig; bars: number }) {
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const t = getChartTheme(theme, colorMode);
  const lines = useMemo<LineSpec[]>(() => {
    const price = candles[forecast.target]!.close;
    const start = candles[forecast.target]!.time;
    const dates = [start, ...futureDates(start, bars, asset.tradesOnWeekends)];
    const toPoints = (path: number[]) => path.slice(0, bars + 1).map((r, k) => ({ time: dates[k]!, value: price * (1 + r) }));
    return [
      ...forecast.paths.map((p, i) => ({
        key: `a${i}`,
        label: '',
        color: withAlpha(t.textMuted, 0.35),
        width: 1 as const,
        points: toPoints(p),
        showLastValue: false,
      })),
      { key: 'median', label: '中位數', color: t.accent, width: 3 as const, points: toPoints(forecast.cone.map((c) => c.p50)) },
    ];
  }, [forecast, candles, asset.tradesOnWeekends, bars, t.textMuted, t.accent]);
  const format = useCallback((v: number) => fmtPrice(v, asset), [asset]);
  return <LineChart lines={lines} height={280} format={format} />;
}
