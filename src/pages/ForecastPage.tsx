import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AssetStateView } from '../components/AssetState';
import { AssetTabs } from '../components/AssetTabs';
import { LineChart, type LineSpec } from '../components/chart/LineChart';
import { PriceChart, type ChartIndicator } from '../components/chart/PriceChart';
import { Card, Notice, PageTitle, Spinner } from '../components/ui';
import { DEFAULT_ASSET_ID, getAsset, type AssetConfig } from '../config/assets';
import { FEATURES, analogForecast, walkForwardCheck, type CheckResult, type Forecast } from '../forecast/analog';
import { bandNote, describeNow, summarizeCheck, summarizeForecast } from '../forecast/summary';
import { fmtDate, fmtNum, fmtPct, fmtPrice, signClass } from '../data/format';
import { useAsset } from '../data/load';
import { completedLength } from '../data/parse';
import { adjustCandles, futureDates } from '../data/resample';
import type { AssetSeries, Candle } from '../data/types';
import { Link, navigate, useLocation, withQuery } from '../router';
import { useResolvedTheme, useSettings } from '../store/settings';
import { getChartTheme, withAlpha } from '../theme';

export function ForecastPage() {
  const { query } = useLocation();
  const lastAsset = useSettings((s) => s.lastAsset);
  const asset = getAsset(query.get('asset')) ?? getAsset(lastAsset) ?? getAsset(DEFAULT_ASSET_ID)!;
  const state = useAsset(asset.id);
  return (
    <div>
      <PageTitle sub="歷史類比法：在過去的資料裡找出和現在走勢最像的日子，看它們之後怎麼走，推估未來可能的範圍；並回頭檢驗這個方法過去準不準。">
        走勢預測
      </PageTitle>
      <div className="mb-4">
        <AssetTabs value={asset.id} onChange={(id) => navigate(withQuery('/forecast', { asset: id }), { replace: true })} />
      </div>
      {state.status === 'ready' ? <ForecastView key={asset.id} asset={asset} series={state.data} /> : <AssetStateView state={state} name={asset.name} />}
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

const fmtFeature = (kind: string, v: number) => (kind === 'pct' ? fmtPct(v) : kind === 'ratio' ? `${fmtNum(v, 2)} 倍` : fmtNum(v, 1));

/** 預測範圍畫在 K 線右邊：中位數（虛線）、一半的情況（深色）、八成的情況（淺色） */
function coneIndicator(f: Forecast, candles: Candle[]): ChartIndicator {
  const n = candles.length;
  const price = candles[f.target]!.close;
  const h = f.cone.length - 1;
  const line = (pick: (p: Forecast['cone'][number]) => number) => {
    const values: (number | null)[] = new Array(n).fill(null);
    // 第 k 天放在 n-1-h+k，再往未來平移 h 根 → 顯示在最後一根之後的第 k 根。
    // 第 0 天就是現在的價格（五條線都一樣）所以不畫：十字線停在最後一根時，圖例會提示「移到右邊的未來日期」
    for (const p of f.cone) if (p.k > 0) values[n - 1 - h + p.k] = price * (1 + pick(p));
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

function ForecastView({ asset, series }: { asset: AssetConfig; series: AssetSeries }) {
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  const t = getChartTheme(theme, colorMode);
  const n = completedLength(series);
  const lastTime = series.candles[n - 1]?.time ?? '';
  // 只用已收盤的 K 棒（還原權息）；比特幣每分鐘的即時價格不影響，收盤資料有變才重算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const candles = useMemo(() => adjustCandles(series.candles, series.adjClose).slice(0, n), [n, lastTime]);
  const forecast = useMemo(() => analogForecast(candles, asset), [candles, asset]);
  // 回頭檢驗要算幾百次，放到畫面出來之後再算
  const [check, setCheck] = useState<CheckResult[] | null>(null);
  useEffect(() => {
    setCheck(null);
    const id = window.setTimeout(() => setCheck(walkForwardCheck(candles, asset)), 30);
    return () => window.clearTimeout(id);
  }, [candles, asset]);

  const cone = useMemo(() => (forecast ? [coneIndicator(forecast, candles)] : []), [forecast, candles]);
  const spaghetti = useMemo<LineSpec[]>(() => {
    if (!forecast) return [];
    const price = candles[forecast.target]!.close;
    const h = forecast.cone.length - 1;
    const dates = [candles[forecast.target]!.time, ...futureDates(candles[forecast.target]!.time, h, asset.tradesOnWeekends)];
    const toPoints = (path: number[]) => path.map((r, k) => ({ time: dates[k]!, value: price * (1 + r) }));
    return [
      ...forecast.paths.map((p, i) => ({ key: `a${i}`, label: '', color: withAlpha(t.textMuted, 0.35), width: 1 as const, points: toPoints(p), showLastValue: false })),
      { key: 'median', label: '中位數', color: t.accent, width: 3 as const, points: toPoints(forecast.cone.map((c) => c.p50)) },
    ];
  }, [forecast, candles, asset.tradesOnWeekends, t.textMuted, t.accent]);

  if (!forecast) return <Notice tone="warn">資料不夠長（至少要一年多的日 K），還沒辦法預測。</Notice>;
  const price = candles[forecast.target]!.close;
  const monthCheck = check?.find((r) => r.horizon.key === '1m');

  return (
    <div className="space-y-4">
      <Card>
        <H2>現在的狀態</H2>
        <p className="text-sm leading-relaxed text-fg">{describeNow(forecast, candles, asset)}</p>
      </Card>

      <Card>
        <H2 sub="從最後一根已收盤的 K 棒往右延伸：虛線是中位數，深色區域是一半的情況（25%～75%），淺色區域是八成的情況（10%～90%）。把十字線移到右邊的未來日期，可以看那天的數字。">
          未來 3 個月的可能範圍
        </H2>
        <PriceChart candles={candles} asset={asset} indicators={cone} visibleBars={Math.min(candles.length, 200)} rangeKey={`forecast|${asset.id}`} />
      </Card>

      <Card>
        <H2>過去相似的情況，之後怎麼走？</H2>
        <Lines lines={summarizeForecast(forecast, candles, asset)} />
        <div className="table-scroll mt-3">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal" />
                <th className="py-1 pr-2 text-right font-normal">上漲機率</th>
                <th className="py-1 pr-2 text-right font-normal">中位數</th>
                <th className="py-1 text-right font-normal">八成範圍（換算價格）</th>
              </tr>
            </thead>
            <tbody>
              {forecast.horizons.map(({ horizon, stats }) => (
                <tr key={horizon.key} className="border-t border-line align-top">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-fg">{horizon.label}</td>
                  <td className="py-1.5 pr-2 text-right text-fg">{fmtPct(stats.up, 0, false)}</td>
                  <td className={`py-1.5 pr-2 text-right ${signClass(stats.median)}`}>{fmtPct(stats.median)}</td>
                  <td className="py-1.5 text-right">
                    <div className="whitespace-nowrap text-fg">
                      {fmtPct(stats.p10)} ～ {fmtPct(stats.p90)}
                    </div>
                    <div className="whitespace-nowrap text-xs text-muted">
                      {fmtPrice(price * (1 + stats.p10), asset)} ～ {fmtPrice(price * (1 + stats.p90), asset)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {check && <p className="mt-2 text-xs leading-relaxed text-muted">{bandNote(check)}</p>}
      </Card>

      <Card>
        <H2 sub="灰色細線是每一個相似日子之後的走勢（換算成現在的價格），粗線是中位數。可以看到：就算起點很像，之後的走法也差很多。">如果歷史重演</H2>
        <LineChart lines={spaghetti} height={300} format={(v) => fmtPrice(v, asset)} />
      </Card>

      <Card>
        <H2 sub="回頭檢驗：假裝站在過去的某一天，只用當時已經知道結果的資料預測，再和後來真正發生的事比對。這是判斷「預測能不能信」最重要的一步。">
          這個方法過去準不準？
        </H2>
        {check && monthCheck ? (
          <>
            <Lines lines={summarizeCheck(monthCheck)} />
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
                    <tr key={r.horizon.key} className="border-t border-line">
                      <td className="whitespace-nowrap py-1.5 pr-2 text-fg">{r.horizon.label}</td>
                      <td className="py-1.5 pr-2 text-right text-muted">{r.tests}</td>
                      <td className={`py-1.5 pr-2 text-right ${r.hit > r.alwaysUp + 0.03 ? 'text-up' : 'text-fg'}`}>{fmtPct(r.hit, 0, false)}</td>
                      <td className="py-1.5 pr-2 text-right text-muted">{fmtPct(r.alwaysUp, 0, false)}</td>
                      <td className="py-1.5 text-right text-fg">{fmtPct(r.coverage, 0, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              「一直猜漲」是最簡單的對照：長期上漲的標的，每次都猜漲就能猜對一半以上。預測方法至少要贏過它，才算有用；「落在八成範圍」越接近 80%，代表範圍估得越準。
            </p>
          </>
        ) : (
          <Spinner label="正在回頭檢驗（每週一次、約 5 年）…" />
        )}
      </Card>

      <Card>
        <H2 sub="「現在」和「相似的日子」的特徵比較。相似的日子是只用這些數字挑出來的，不包含消息面。">為什麼說它們「相似」？</H2>
        <div className="table-scroll">
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
        <h3 className="mt-4 mb-2 text-sm font-semibold text-fg">最像現在的 10 個日子</h3>
        <div className="table-scroll">
          <table className="w-full min-w-[520px] text-sm tabular">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal">#</th>
                <th className="py-1 pr-2 font-normal">日期</th>
                <th className="py-1 pr-2 text-right font-normal">當時近 1 個月</th>
                {forecast.horizons.map((h) => (
                  <th key={h.horizon.key} className="py-1 pr-2 text-right font-normal last:pr-0">
                    之後 {h.horizon.label.replace(/後$/, '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.analogs.slice(0, 10).map((a, i) => (
                <tr key={a.index} className="border-t border-line">
                  <td className="py-1.5 pr-2 text-muted">{i + 1}</td>
                  <td className="py-1.5 pr-2 text-fg">{fmtDate(candles[a.index]!.time)}</td>
                  <td className={`py-1.5 pr-2 text-right ${signClass(forecast.analogFeatures[i]![2])}`}>{fmtPct(forecast.analogFeatures[i]![2])}</td>
                  {forecast.horizons.map((h) => {
                    const r = forecast.paths[i]![h.horizon.bars]!;
                    return (
                      <td key={h.horizon.key} className={`py-1.5 pr-2 text-right last:pr-0 ${signClass(r)}`}>
                        {fmtPct(r)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <H2>這是怎麼算的？</H2>
        <div className="space-y-2 text-sm leading-relaxed text-fg">
          <p>
            這種方法叫做<strong>「歷史類比法」</strong>（Analog Forecasting），也有人叫「相似走勢比對」或「相似 K 線」；在機器學習裡，它就是
            <strong>「k 最近鄰」</strong>（k-NN）。早年的天氣預報也用過同樣的想法：找出過去天氣型態最像今天的日子，看那些日子隔天的天氣。
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>用 9 個數字描述每一天的狀態：最近 1 週、2 週、1 個月、2 個月、3 個月的漲跌，和 200 日均線的距離，RSI，最近的波動和過去一年比，以及離一年內最高點多遠。</li>
            <li>把每個數字換成「標準分數」，讓不同單位的數字可以放在一起比較，再算出每一天和「現在」差多少。</li>
            <li>挑出最接近的 30 天，而且彼此至少相隔 1 個月，避免同一段行情被重複計算、讓結果看起來比實際更有把握。</li>
            <li>看這 30 天之後 1 週、1 個月、3 個月的漲跌，整理成上漲機率、中位數與可能範圍。</li>
          </ol>
          <p>
            為什麼只看到 3 個月？時間拉得越長，相似的日子越少、市場的環境也差越多；1 週以內又幾乎都是隨機的雜訊。
          </p>
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
      </Card>

      <Notice tone="warn">
        <strong className="font-semibold">這不是投資建議：</strong>
        這個頁面是讓你了解「如果歷史重演，可能的範圍有多大」，以及「預測未來有多難」。實際走勢可能完全不同，請不要只依照這裡的數字買賣。
      </Notice>
    </div>
  );
}
