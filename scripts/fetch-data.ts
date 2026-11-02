/*
 * 抓取所有標的的日線資料，寫到 public/data/。
 * 由 GitHub Actions 每天自動執行，也可以手動執行：npm run fetch-data
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
      // 沒有新的已收盤 K 棒就不改檔案（排程每小時跑一次，避免產生沒有意義的 commit）
      const unchanged =
        prev &&
        JSON.stringify(prev.bars) === JSON.stringify(file.bars) &&
        JSON.stringify(prev.events) === JSON.stringify(file.events);
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

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
