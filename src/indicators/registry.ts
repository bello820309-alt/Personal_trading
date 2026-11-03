import type { Candle } from '../data/types';
import type { Market } from '../config/assets';
import { donchianIndicator } from './trend/donchian';
import { dmiIndicator } from './trend/dmi';
import { ichimokuIndicator } from './trend/ichimoku';
import { macdIndicator } from './trend/macd';
import { maCrossIndicator } from './trend/maCross';
import { emaIndicator, smaIndicator } from './trend/movingAverage';
import { psarIndicator } from './trend/psar';
import { supertrendIndicator } from './trend/supertrend';
import { biasIndicator } from './momentum/bias';
import { cciIndicator } from './momentum/cci';
import { kdIndicator } from './momentum/kd';
import { psyIndicator } from './momentum/psy';
import { rocIndicator } from './momentum/roc';
import { rsiIndicator } from './momentum/rsi';
import { stochRsiIndicator } from './momentum/stochRsi';
import { williamsRIndicator } from './momentum/williamsR';
import { atrIndicator } from './volatility/atr';
import { bollingerIndicator } from './volatility/bollinger';
import { keltnerIndicator } from './volatility/keltner';
import { mfiIndicator } from './volume/mfi';
import { obvIndicator } from './volume/obv';
import { volumeIndicator } from './volume/volume';
import { fibonacciIndicator } from './levels/fibonacci';
import { pivotIndicator } from './levels/pivot';
import { fearGreedIndicator } from './crypto/fearGreed';
import { fundingIndicator } from './crypto/funding';
import { mvrvIndicator } from './crypto/mvrv';
import { activeAddressesIndicator, hashRibbonsIndicator } from './crypto/onchainTrend';
import {
  CATEGORY_ORDER,
  resolveParams,
  type Category,
  type IndicatorContext,
  type IndicatorDef,
  type IndicatorResult,
  type Params,
  type Signal,
  type StateSummary,
} from './types';

/*
 * 所有指標都在這裡註冊。圖表、指標百科、回測、總覽都從這份清單讀取，
 * 所以要新增一個指標（包括你之後自己設計的模型），只要：
 *   1. 在 src/indicators/<分類>/ 新增一個檔案，照 IndicatorDef 的格式寫
 *   2. 在 src/content/indicators/ 新增它的解說
 *   3. 把它加進下面的 INDICATORS
 */
export const INDICATORS: IndicatorDef[] = [
  // 趨勢
  smaIndicator,
  emaIndicator,
  maCrossIndicator,
  macdIndicator,
  dmiIndicator,
  psarIndicator,
  ichimokuIndicator,
  supertrendIndicator,
  donchianIndicator,
  // 動能／擺盪
  rsiIndicator,
  kdIndicator,
  williamsRIndicator,
  cciIndicator,
  rocIndicator,
  biasIndicator,
  stochRsiIndicator,
  psyIndicator,
  // 波動
  bollingerIndicator,
  atrIndicator,
  keltnerIndicator,
  // 量能
  volumeIndicator,
  obvIndicator,
  mfiIndicator,
  // 價位
  fibonacciIndicator,
  pivotIndicator,
  // 比特幣專屬（情緒、合約、鏈上）
  fearGreedIndicator,
  fundingIndicator,
  mvrvIndicator,
  activeAddressesIndicator,
  hashRibbonsIndicator,
] as IndicatorDef[];

const BY_ID = new Map(INDICATORS.map((d) => [d.id, d]));

export function getIndicator(id: string | null | undefined): IndicatorDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** 這個指標能不能用在這個標的（例如鏈上資料只有比特幣有） */
export function supportsAsset(def: IndicatorDef, assetId: string | undefined): boolean {
  return !def.assets || (!!assetId && def.assets.includes(assetId));
}

/** 需要的額外資料都已經載入了 */
export function hasRequiredData(def: IndicatorDef, ctx?: IndicatorContext): boolean {
  return !def.requires || def.requires.every((k) => !!ctx?.extra?.series[k]);
}

/** 依分類列出指標；有給標的時，只列出這個標的能用的 */
export function indicatorsByCategory(assetId?: string): { category: Category; items: IndicatorDef[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: INDICATORS.filter((d) => d.category === category && (assetId === undefined || supportsAsset(d, assetId))),
  })).filter((g) => g.items.length > 0);
}

export interface ComputedIndicator {
  def: IndicatorDef;
  params: Params;
  result: IndicatorResult;
}

export function computeIndicator(
  def: IndicatorDef,
  candles: Candle[],
  market: Market,
  custom?: Params | null,
  ctx?: IndicatorContext,
): ComputedIndicator {
  const params = resolveParams(def, market, custom);
  return { def, params, result: def.compute(candles, params, ctx) };
}

export function signalsOf(ci: ComputedIndicator, candles: Candle[]): Signal[] {
  return ci.def.signals ? ci.def.signals(candles, ci.result, ci.params) : [];
}

export function describeOf(ci: ComputedIndicator, candles: Candle[]): StateSummary | null {
  try {
    return ci.def.describe ? ci.def.describe(candles, ci.result, ci.params) : null;
  } catch {
    return null;
  }
}

export const STRATEGY_INDICATORS = INDICATORS.filter((d) => d.strategy && d.signals);
