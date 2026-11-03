import { getAsset } from '../config/assets';
import { getBasics } from '../content/basics';
import { getIndicator } from '../indicators/registry';
import type { LabFill, LabOrder } from './types';

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 新台幣金額：NT$1,012,345 */
export function twd(v: number): string {
  return `${v < 0 ? '-' : ''}NT$${nf0.format(Math.abs(Math.round(v)))}`;
}

/** 有正負號的新台幣金額：+NT$12,345 */
export function twdSigned(v: number): string {
  return `${v > 0 ? '+' : ''}${twd(v)}`;
}

/** 圖表座標用：101.2 萬 */
export function twdWan(v: number): string {
  return `${(v / 10000).toFixed(1)} 萬`;
}

/** 原幣價格：NT$102.50、US$691.32、US$76,677 */
export function priceText(assetId: string, v: number): string {
  const a = getAsset(assetId);
  if (!a) return String(v);
  const digits = a.market === 'crypto' && v >= 1000 ? 0 : 2;
  return `${a.currencySymbol}${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** 數量：978 股、4.4888 股、0.05686606 顆 */
export function unitsText(assetId: string, v: number): string {
  const a = getAsset(assetId);
  if (a?.market === 'tw') return `${nf0.format(v)} 股`;
  if (a?.market === 'us') return `${v.toLocaleString('en-US', { maximumFractionDigits: 4 })} 股`;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 8 })} 顆`;
}

export function assetName(id: string): string {
  return getAsset(id)?.shortName ?? id;
}

/** 買進 0050 NT$100,000／賣出 BTC 持有的 50% */
export function orderText(o: Pick<LabOrder, 'asset' | 'side' | 'amount' | 'pct'>): string {
  return o.side === 'buy' ? `買進 ${assetName(o.asset)} ${twd(o.amount ?? 0)}` : `賣出 ${assetName(o.asset)} 持有的 ${o.pct}%`;
}

/** 成交結果的白話說明（不含日期） */
export function fillText(f: LabFill): string {
  if (f.status !== 'filled') return `沒有成交：${f.note ?? ''}`;
  const fx = f.fx ? `（匯率 ${f.fx}）` : '';
  const costs = [f.fee ? `手續費 ${twd(f.fee)}` : '', f.tax ? `稅 ${twd(f.tax)}` : ''].filter(Boolean).join('、');
  const money = f.side === 'buy' ? `花 ${twd(-(f.cash ?? 0))}` : `拿回 ${twd(f.cash ?? 0)}`;
  return `以 ${priceText(f.asset, f.price ?? 0)}${fx || ' '}成交 ${unitsText(f.asset, f.units ?? 0)}，${money}${costs ? `（${costs}）` : ''}`;
}

const SECTION_LABELS: [RegExp, string][] = [
  [/^\/$/, '總覽'],
  [/^\/learn$/, '指標百科'],
  [/^\/glossary/, '名詞解釋'],
  [/^\/chart/, '圖表'],
  [/^\/backtest\/rank/, '策略排行榜'],
  [/^\/backtest\/events/, '消息面事件'],
  [/^\/backtest\/dca/, '動態定投'],
  [/^\/backtest/, '回測'],
  [/^\/forecast/, '走勢預測'],
  [/^\/settings/, '設定與關於'],
  [/^\/lab/, 'AI 實驗'],
];

/** 參加者寫的頁面路徑 → 好讀的名稱，例如 /learn/rsi → 指標百科：RSI */
export function pageLabel(route: string): string {
  const [path, q = ''] = route.split('?');
  const asset = getAsset(new URLSearchParams(q).get('asset') ?? undefined);
  const suffix = asset ? `（${asset.shortName}）` : '';
  const learn = path!.match(/^\/learn\/([^/]+)$/);
  if (learn) {
    const def = getIndicator(learn[1]);
    return def ? `指標百科：${def.shortName}${suffix}` : route;
  }
  const basics = path!.match(/^\/basics\/([^/]+)$/);
  if (basics) return getBasics(basics[1])?.title ?? route;
  const chart = path!.match(/^\/chart\/([^/]+)$/);
  if (chart) return `圖表：${getAsset(chart[1])?.shortName ?? chart[1]}`;
  for (const [re, label] of SECTION_LABELS) if (re.test(path!)) return `${label}${suffix}`;
  return route;
}
