/*
 * 抓取所有標的的日線資料，寫到 public/data/。
 * 由 GitHub Actions 在收盤後執行（由外部排程觸發，見 README），也可以手動執行：npm run fetch-data
 *
 * 安全機制：
 * - 任何一個標的抓取或驗證失敗，就保留上一版的資料，並在 manifest 標記為 stale。
 * - 最後有失敗就以錯誤結束，GitHub 會寄信通知。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS } from '../src/config/assets.ts';
import type { AssetDataFile, DataManifest, ManifestEntry } from '../src/data/types.ts';
import type { FxDataFile } from '../src/data/fx.ts';
import { sameMarketData } from './lib/compare.ts';
import { FX_ID, FX_SYMBOL, normalizeFx, sameFx, stringifyFx, validateFx } from './lib/fx.ts';
import { fetchYahooChart } from './lib/yahoo.ts';
import { normalizeYahooChart, stringifyAssetFile } from './lib/normalize.ts';
import { validateAssetFile } from './lib/validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data');

function readPrev(path: string): AssetDataFile | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AssetDataFile;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const now = new Date();
  const entries: ManifestEntry[] = [];
  let failures = 0;

  for (const asset of ASSETS) {
    const path = join(outDir, `${asset.id}.json`);
    const prev = readPrev(path);
    console.log(`▶ ${asset.id}（${asset.symbol}）`);
    try {
      const json = await fetchYahooChart(asset.symbol, { log: console.log });
      const { file, warnings, currency } = normalizeYahooChart(json, asset, now);
      const report = validateAssetFile(file, asset, prev, now, currency);
      for (const w of [...warnings, ...report.warnings]) console.log(`  ⚠ ${w}`);
      if (report.errors.length) throw new Error(`資料驗證失敗：${report.errors.join('；')}`);
      // 行情沒有變化就不改檔案（定時檢查時，避免產生沒有意義的 commit 和部署）。
      // Yahoo 的還原權息價每次都有很小的捨入差異，所以不能用「完全相等」來比較。
      const unchanged = prev !== null && sameMarketData(prev, file);
      const saved = unchanged ? prev : file;
      if (!unchanged) writeFileSync(path, stringifyAssetFile(file));
      const n = saved.bars.t.length;
      console.log(
        `  ${unchanged ? '=' : '✓'} ${n} 根 K 棒：${saved.bars.t[0]} ～ ${saved.bars.t[n - 1]}，最新收盤 ${saved.bars.c[n - 1]}，` +
          `配息 ${saved.events.dividends.length} 次，分割 ${saved.events.splits.length} 次${unchanged ? '（沒有新資料，檔案不變）' : ''}`,
      );
      entries.push({
        id: asset.id,
        symbol: asset.symbol,
        status: 'ok',
        updatedAt: saved.updatedAt,
        lastDate: saved.bars.t[n - 1],
        bars: n,
      });
    } catch (e) {
      failures++;
      const message = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ ${message}`);
      const n = prev?.bars.t.length ?? 0;
      entries.push({
        id: asset.id,
        symbol: asset.symbol,
        status: prev ? 'stale' : 'missing',
        updatedAt: prev?.updatedAt,
        lastDate: prev ? prev.bars.t[n - 1] : undefined,
        bars: prev ? n : undefined,
        error: message,
      });
    }
  }

  await updateFx(now);

  // manifest 也只在內容有變時才改寫（generatedAt = 資料最後一次有變動的時間）
  const manifestPath = join(outDir, 'manifest.json');
  let prevManifest: DataManifest | null = null;
  try {
    prevManifest = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as DataManifest) : null;
  } catch {
    prevManifest = null;
  }
  if (!prevManifest || JSON.stringify(prevManifest.assets) !== JSON.stringify(entries)) {
    const manifest: DataManifest = { schemaVersion: 1, generatedAt: now.toISOString(), assets: entries };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (failures > 0) {
    console.error(`有 ${failures} 個標的更新失敗（已保留上一版資料）。`);
    process.exitCode = 1;
  } else {
    console.log('全部更新完成。');
  }
}

/**
 * 美元兌新台幣匯率（給「AI 模擬交易」換算用）。
 * 失敗時保留上一版，只在 GitHub Actions 顯示警告，不讓整個更新失敗：行情資料比較重要，
 * 模擬交易遇到匯率還沒更新時會用最近一天的匯率。
 */
async function updateFx(now: Date): Promise<void> {
  const path = join(outDir, `${FX_ID}.json`);
  let prev: FxDataFile | null = null;
  try {
    prev = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as FxDataFile) : null;
  } catch {
    prev = null;
  }
  console.log(`▶ 匯率 ${FX_ID}（${FX_SYMBOL}）`);
  try {
    const json = await fetchYahooChart(FX_SYMBOL, { log: console.log });
    const { file, warnings, currency } = normalizeFx(json, now);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
    const errors = validateFx(file, prev, currency);
    if (errors.length) throw new Error(`匯率驗證失敗：${errors.join('；')}`);
    const unchanged = prev !== null && sameFx(prev, file);
    if (!unchanged) writeFileSync(path, stringifyFx(file));
    const saved = unchanged ? prev! : file;
    const n = saved.t.length;
    console.log(`  ${unchanged ? '=' : '✓'} ${n} 天：${saved.t[0]} ～ ${saved.t[n - 1]}，最新 ${saved.c[n - 1]}${unchanged ? '（沒有新資料，檔案不變）' : ''}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${message}`);
    console.log(`::warning title=匯率資料更新失敗::${message}（已保留上一版）`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
