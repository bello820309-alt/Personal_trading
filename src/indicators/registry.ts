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
import {
  CATEGORY_ORDER,
  resolveParams,
  type Category,
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
] as IndicatorDef[];

const BY_ID = new Map(INDICATORS.map((d) => [d.id, d]));

export function getIndicator(id: string | null | undefined): IndicatorDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function indicatorsByCategory(): { category: Category; items: IndicatorDef[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: INDICATORS.filter((d) => d.category === category),
  }));
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
): ComputedIndicator {
  const params = resolveParams(def, market, custom);
  return { def, params, result: def.compute(candles, params) };
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
