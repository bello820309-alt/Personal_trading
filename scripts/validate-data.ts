/*
 * 檢查 public/data/ 裡的資料是否合理：npm run validate-data
 * 也會印出 0050 在 2025 年 6 月 1 拆 4 前後的價格，確認分割調整是連續的。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS } from '../src/config/assets.ts';
import type { AssetDataFile, DataManifest } from '../src/data/types.ts';
import { validateAssetFile } from './lib/validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'public', 'data');
let failed = false;

const manifestPath = join(dataDir, 'manifest.json');
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as DataManifest;
  console.log(`manifest：產生於 ${m.generatedAt}`);
  for (const a of m.assets) console.log(`  ${a.id}: ${a.status}${a.error ? `（${a.error}）` : ''}`);
} else {
  console.log('找不到 manifest.json');
  failed = true;
}

for (const asset of ASSETS) {
  const path = join(dataDir, `${asset.id}.json`);
  if (!existsSync(path)) {
    console.log(`✗ ${asset.id}：找不到資料檔`);
    failed = true;
    continue;
  }
  const file = JSON.parse(readFileSync(path, 'utf8')) as AssetDataFile;
  const { t, c, v, ac } = file.bars;
  const n = t.length;
  const report = validateAssetFile(file, asset, null, new Date());
  let maxUp = 0;
  let maxDown = 0;
  for (let i = 1; i < n; i++) {
    const r = c[i]! / c[i - 1]! - 1;
    maxUp = Math.max(maxUp, r);
    maxDown = Math.min(maxDown, r);
  }
  const avgVol = v.slice(-20).reduce((s, x) => s + x, 0) / Math.min(20, n);
  console.log(`\n${report.errors.length ? '✗' : '✓'} ${asset.id}（${file.symbol}，${file.currency}，時區 ${file.timezone}）`);
  console.log(`  ${n} 根：${t[0]} ～ ${t[n - 1]}，最新收盤 ${c[n - 1]}，還原收盤 ${ac[n - 1]}`);
  console.log(`  單日最大漲幅 ${(maxUp * 100).toFixed(2)}%、最大跌幅 ${(maxDown * 100).toFixed(2)}%`);
  console.log(`  近 20 日平均成交量 ${Math.round(avgVol).toLocaleString('en-US')}（原始單位）`);
  console.log(`  配息 ${file.events.dividends.length} 次，分割：${file.events.splits.map((s) => `${s.date} ${s.numerator}:${s.denominator}`).join('、') || '無'}`);
  console.log(`  抓取時間 ${file.updatedAt}，最後一根${file.lastBarComplete ? '已收盤' : '尚未收盤'}`);
  for (const w of report.warnings) console.log(`  ⚠ ${w}`);
  for (const e of report.errors) console.log(`  ✗ ${e}`);
  if (report.errors.length) failed = true;

  if (asset.id === '0050') {
    const from = t.findIndex((d) => d >= '2025-06-05');
    if (from >= 0) {
      console.log('  0050 分割前後（2025-06 中旬）的收盤價：');
      for (let i = from; i < Math.min(n, from + 8); i++) console.log(`    ${t[i]}  ${c[i]}`);
    }
  }
}

if (failed) process.exitCode = 1;
