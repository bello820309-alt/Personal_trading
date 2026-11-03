import type { AssetConfig } from '../../config/assets';
import { fmtAuto, fmtCompact, fmtMoney, fmtNum, fmtVolume } from '../../data/format';
import type { IndicatorResult, LineOutput } from '../../indicators/types';

/** 要顯示在圖例與說明裡的線（不含隱藏的線），依 legendOrder 排序 */
export function orderedLines(result: IndicatorResult): LineOutput[] {
  const visible = result.lines.filter((l) => !l.hidden);
  const order = result.legendOrder;
  if (!order) return visible;
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i < 0 ? order.length : i;
  };
  return [...visible].sort((a, b) => rank(a.key) - rank(b.key));
}

/** 圖上第 index 根 K 棒位置顯示的數值（考慮一目均衡表的平移） */
export function lineValueAt(line: LineOutput, index: number): number | null {
  const v = line.values[index - (line.shift ?? 0)];
  return v === undefined ? null : v;
}

/** 第 index 根 K 棒位置的顏色角色（MACD 柱狀體、SAR 點會逐根變色） */
export function lineColorAt(line: LineOutput, index: number) {
  return line.colors?.[index - (line.shift ?? 0)] ?? line.color;
}

export function formatLineValue(v: number | null, line: LineOutput, asset: AssetConfig): string {
  if (v === null) return '—';
  if (line.unit === 'volume') return fmtVolume(v, asset);
  if (line.unit === 'percent') return `${fmtNum(v, 2)}%`;
  if (line.unit === 'money') return fmtMoney(v, asset, Number.isInteger(v) ? 0 : 2);
  return fmtAuto(v);
}

/** 圖例用的精簡數值：成交量不重複寫單位（例如「39.5億」），節省空間 */
export function formatLegendValue(v: number | null, line: LineOutput, asset: AssetConfig): string {
  if (v !== null && line.unit === 'volume') return fmtCompact(v / asset.volume.divisor);
  return formatLineValue(v, line, asset);
}

/** 圖例用的短名稱：拿掉括號裡的補充說明（例如「DIF（快線）」→「DIF」），完整說明在圖表下方 */
export function legendLabel(line: LineOutput): string {
  return line.label.replace(/（[^）]*）/g, '').trim() || line.label;
}
