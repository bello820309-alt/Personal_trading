import type { Candle } from '../data/types';
import type { ExtraDataFile, ExtraKey } from '../data/extra';
import type { Market } from '../config/assets';

/** 指標數列：和 K 棒一一對應，暖身期（資料還不夠算）為 null */
export type Num = number | null;
export type Series = Num[];

export type Category = 'trend' | 'momentum' | 'volatility' | 'volume' | 'levels' | 'crypto';

export const CATEGORY_LABELS: Record<Category, string> = {
  trend: '趨勢',
  momentum: '動能／擺盪',
  volatility: '波動',
  volume: '量能',
  levels: '價位',
  crypto: '比特幣專屬（情緒、合約、鏈上）',
};

export const CATEGORY_INTRO: Record<Category, string> = {
  trend: '判斷價格現在往哪個方向走、走得穩不穩。',
  momentum: '衡量漲跌的力道，常用來看「是不是漲過頭或跌過頭」。',
  volatility: '衡量價格晃動有多大，不分漲跌。',
  volume: '從成交量看資金進出，搭配價格一起解讀。',
  levels: '找出可能的支撐、壓力價位。',
  crypto: '不是從 K 線算出來的，而是比特幣才有的資料：市場情緒、合約的資金費率、區塊鏈上的活動。只有比特幣可以用。',
};

export const CATEGORY_ORDER: Category[] = ['trend', 'momentum', 'volatility', 'volume', 'levels', 'crypto'];

/** 計算指標時可以用到的額外資料（目前只有比特幣的情緒、合約、鏈上資料） */
export interface IndicatorContext {
  extra?: ExtraDataFile | null;
  /** 成交量怎麼顯示（台股以「張」為單位要除以 1000），給成交量的白話說明用 */
  volume?: { divisor: number; unit: string };
}

export type ParamValue = number | string | number[];
export type Params = Record<string, ParamValue>;

interface ParamBase {
  key: string;
  label: string;
  help?: string;
}
export interface NumberParam extends ParamBase {
  type: 'number';
  min: number;
  max: number;
  step: number;
}
export interface ListParam extends ParamBase {
  type: 'list';
  min: number;
  max: number;
  maxItems: number;
}
export interface SelectParam extends ParamBase {
  type: 'select';
  options: { value: string; label: string }[];
}
export type ParamSpec = NumberParam | ListParam | SelectParam;

/** 顏色角色：由圖表依主題與「紅漲綠跌」設定轉成實際色碼 */
export type ColorRole = 'up' | 'down' | 'accent' | 'hot' | 'cold' | 'muted' | 's0' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6';

export function seriesColor(i: number): ColorRole {
  return (['s0', 's1', 's2', 's3', 's4', 's5', 's6'] as const)[i % 7]!;
}

export interface LineOutput {
  key: string;
  label: string;
  values: Series;
  kind: 'line' | 'histogram' | 'dots' | 'step';
  color: ColorRole;
  /** 逐根 K 棒的顏色（例如 MACD 柱狀體、SAR 點） */
  colors?: (ColorRole | null)[];
  width?: 1 | 2 | 3;
  dashed?: boolean;
  /** 顯示時平移幾根 K 棒：正數往未來、負數往過去（一目均衡表用）。計算本身不受影響。 */
  shift?: number;
  /** 只用來計算訊號或顯示數值，不畫在圖上 */
  hidden?: boolean;
  /** 數值是成交量（顯示時套用標的的單位，例如台股的「張」） */
  unit?: 'volume' | 'percent' | 'price' | 'money';
}

export interface FillOutput {
  upper: string;
  lower: string;
  color: ColorRole;
  /** 當 lower 線在 upper 線之上時改用的顏色（一目均衡表的雲） */
  colorWhenInverted?: ColorRole;
  opacity?: number;
}

export interface LevelLine {
  value: number;
  label: string;
  color?: ColorRole;
}

export interface PriceLevel {
  value: number;
  label: string;
  color: ColorRole;
}

export interface IndicatorResult {
  lines: LineOutput[];
  fills?: FillOutput[];
  /** 副圖上的水平參考線（例如 RSI 的 30 / 70） */
  levels?: LevelLine[];
  /** 主圖上的水平價位（費波那契、樞軸點） */
  priceLevels?: PriceLevel[];
  /** 固定的數值範圍（0～100 的擺盪指標） */
  scale?: { min: number; max: number };
  /** 圖例與說明裡線的顯示順序（線的 key）；沒有指定就照 lines 的順序 */
  legendOrder?: string[];
  /** 比最後一根 K 棒還新、已經公布的資料（例如當天早上公布的恐懼貪婪指數），給白話說明用 */
  newer?: { date: string; value: number };
  /** 成交量的顯示單位（計算時有帶入才有） */
  volumeUnit?: { divisor: number; unit: string };
}

export type Tone = 'bullish' | 'bearish' | 'hot' | 'cold' | 'neutral';

export const TONE_LABELS: Record<Tone, string> = {
  bullish: '偏多',
  bearish: '偏空',
  hot: '過熱',
  cold: '過冷',
  neutral: '中性',
};

/** 指標「目前怎麼說」的白話摘要 */
export interface StateSummary {
  tone: Tone;
  headline: string;
  detail: string;
}

/** 買進或賣出訊號：在第 index 根 K 棒收盤時成立 */
export interface Signal {
  index: number;
  side: 'buy' | 'sell';
  label: string;
}

export interface StrategyInfo {
  name: string;
  buyRule: string;
  sellRule: string;
}

export interface IndicatorDef<P extends Params = Params> {
  id: string;
  /** 簡稱，例如 RSI */
  shortName: string;
  /** 中文名稱，例如 相對強弱指標 */
  name: string;
  enName: string;
  category: Category;
  /** overlay = 疊在 K 線上；pane = 獨立的副圖 */
  placement: 'overlay' | 'pane';
  params: ParamSpec[];
  defaults: P;
  /** 不同市場的常用設定 */
  marketDefaults?: Partial<Record<Market, Partial<P>>>;
  presets?: { label: string; values: Partial<P> }[];
  /** 只有這些標的可以用（例如比特幣的鏈上資料）；沒寫代表所有標的都可以 */
  assets?: string[];
  /** 需要的額外資料（public/data/BTC_extra.json 裡的哪幾項） */
  requires?: ExtraKey[];
  compute(candles: Candle[], params: P, ctx?: IndicatorContext): IndicatorResult;
  signals?(candles: Candle[], result: IndicatorResult, params: P): Signal[];
  describe?(candles: Candle[], result: IndicatorResult, params: P): StateSummary | null;
  /** 回測用的經典規則（使用 signals() 的買賣訊號） */
  strategy?: StrategyInfo;
  /** 不產生買賣訊號的原因 */
  noSignalReason?: string;
}

/** 合併參數：預設值 ← 市場常用值 ← 使用者自訂 */
export function resolveParams<P extends Params>(def: IndicatorDef<P>, market: Market, custom?: Partial<P> | null): P {
  return { ...def.defaults, ...(def.marketDefaults?.[market] ?? {}), ...(custom ?? {}) } as P;
}

export function getLine(result: IndicatorResult, key: string): Series {
  const line = result.lines.find((l) => l.key === key);
  if (!line) throw new Error(`找不到指標線 ${key}`);
  return line.values;
}
