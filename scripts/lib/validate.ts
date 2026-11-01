import type { AssetConfig } from '../../src/config/assets.ts';
import type { AssetDataFile } from '../../src/data/types.ts';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 寫入前的檢查。發現 errors 就拒絕覆蓋舊資料（保留上一版的好資料）。
 */
export function validateAssetFile(
  file: AssetDataFile,
  asset: AssetConfig,
  prev: AssetDataFile | null,
  now: Date,
  reportedCurrency?: string,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { t, o, h, l, c, v, ac } = file.bars;
  const n = t.length;

  if (reportedCurrency && reportedCurrency.toUpperCase() !== asset.currency) {
    errors.push(`幣別不符：設定是 ${asset.currency}，Yahoo 回報 ${reportedCurrency}（代號可能抓錯）`);
  }
  if (n < 250) errors.push(`資料太少（${n} 根），可能抓取不完整`);
  for (const [name, arr] of Object.entries({ o, h, l, c, v, ac })) {
    if (arr.length !== n) errors.push(`欄位 ${name} 長度 ${arr.length} 和日期數 ${n} 不一致`);
  }
  if (errors.length) return { errors, warnings };

  let badOrder = 0;
  let badPrice = 0;
  for (let i = 0; i < n; i++) {
    if (!DATE_RE.test(t[i]!) || (i > 0 && t[i]! <= t[i - 1]!)) badOrder++;
    const vals = [o[i]!, h[i]!, l[i]!, c[i]!, ac[i]!];
    if (vals.some((x) => !Number.isFinite(x) || x <= 0)) badPrice++;
    else if (h[i]! + 1e-9 < Math.max(o[i]!, c[i]!) || l[i]! - 1e-9 > Math.min(o[i]!, c[i]!)) badPrice++;
    if (!Number.isFinite(v[i]!) || v[i]! < 0) badPrice++;
  }
  if (badOrder) errors.push(`${badOrder} 筆日期格式錯誤或沒有遞增`);
  if (badPrice) errors.push(`${badPrice} 筆價格不合理（非正數或高低價矛盾）`);

  // 單日漲跌幅檢查：分割調整正確的話，不會出現極端跳動
  const limit = asset.market === 'crypto' ? 0.5 : 0.3;
  const jumps: string[] = [];
  for (let i = 1; i < n; i++) {
    const r = c[i]! / c[i - 1]! - 1;
    if (Math.abs(r) > limit) jumps.push(`${t[i]}（${(r * 100).toFixed(1)}%）`);
  }
  if (jumps.length) errors.push(`單日漲跌超過 ${limit * 100}%，可能是分割沒有調整：${jumps.slice(0, 5).join('、')}`);

  // 資料是否太舊
  const ageDays = (now.getTime() - Date.parse(`${t[n - 1]}T00:00:00Z`)) / 86400000;
  if (ageDays > 15) warnings.push(`最新一筆是 ${t[n - 1]}，已經 ${Math.floor(ageDays)} 天沒有更新`);

  // 和上一版比較：歷史資料不應該大幅改變
  if (prev && prev.bars.t.length > 0) {
    // 容許少量差異（例如休市日的整理規則改變），但大幅變少代表抓到的歷史被截斷
    if (n < prev.bars.t.length * 0.98 - 5) errors.push(`歷史資料變少了（上一版 ${prev.bars.t.length} 根，這次 ${n} 根）`);
    const newSplit = file.events.splits.some((s) => !prev.events.splits.some((p) => p.date === s.date));
    const prevIdx = new Map(prev.bars.t.map((d, i) => [d, i]));
    let overlap = 0;
    let mismatch = 0;
    for (let i = 0; i < n - 5; i++) {
      const j = prevIdx.get(t[i]!);
      if (j === undefined) continue;
      overlap++;
      if (Math.abs(c[i]! / prev.bars.c[j]! - 1) > 0.01) mismatch++;
    }
    if (overlap > 0 && mismatch / overlap > 0.02) {
      const msg = `和上一版相比，有 ${mismatch}／${overlap} 筆歷史收盤價差異超過 1%`;
      if (newSplit) warnings.push(`${msg}（有新的分割事件，屬於正常調整）`);
      else errors.push(msg);
    }
  }
  return { errors, warnings };
}
