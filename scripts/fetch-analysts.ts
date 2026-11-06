/*
 * 抓取追蹤的分析師最近的 YouTube 影片清單（頻道的 RSS），寫到 public/analysts/{id}.videos.json。
 * 由 GitHub Actions 在抓完行情後執行，也可以手動執行：npm run fetch-analysts
 * （在 Claude 的雲端環境要加 NODE_USE_ENV_PROXY=1，Node 內建的 fetch 才會走代理）
 *
 * - 只抓標題、上傳時間；影片內容（逐字稿）YouTube 會擋雲端主機，所以由使用者貼給 Claude 整理。
 * - 清單沒有變化就不寫檔（不會產生多餘的 commit 和部署）。
 * - 抓取失敗時保留上一版，不影響行情資料。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalystIndex, AnalystVideoFile } from '../src/analysts/types.ts';
import { mergeVideos, parseFeed, sameVideos } from './lib/analysts.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'analysts');
const UA = 'Mozilla/5.0 (compatible; personal-trading-data/1.0; +https://github.com/bello820309-alt/Personal_trading)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getText(url: string): Promise<string> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml, application/xml, */*' }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return await res.text();
      last = new Error(`HTTP ${res.status}`);
      // YouTube 的 RSS 偶爾會短暫回 404／5xx，所以都重試
    } catch (e) {
      last = e;
    }
    await sleep(3000 * (attempt + 1));
  }
  throw last;
}

async function main() {
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as AnalystIndex;
  let failed = 0;
  for (const a of index.analysts) {
    const path = join(dir, `${a.id}.videos.json`);
    const old: AnalystVideoFile | null = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as AnalystVideoFile) : null;
    try {
      const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(a.channelId)}`);
      const fresh = parseFeed(xml);
      if (fresh.length === 0) throw new Error('RSS 裡沒有影片（格式可能變了）');
      const videos = mergeVideos(old?.videos ?? [], fresh);
      if (old && old.channelId === a.channelId && sameVideos(old.videos, videos)) {
        console.log(`${a.name}：沒有新影片（共 ${videos.length} 支）`);
        continue;
      }
      const added = videos.filter((v) => !old?.videos.some((o) => o.id === v.id));
      const file: AnalystVideoFile = { schemaVersion: 1, channelId: a.channelId, fetchedAt: new Date().toISOString(), videos };
      writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
      console.log(`${a.name}：新增 ${added.length} 支${added.length ? `（${added.map((v) => v.title).join('、')}）` : '（標題有更新）'}，共 ${videos.length} 支`);
    } catch (e) {
      failed++;
      console.log(`::warning title=分析師影片清單抓取失敗::${a.name}：${e instanceof Error ? e.message : String(e)}（保留上一版）`);
    }
  }
  if (failed === index.analysts.length && failed > 0) process.exitCode = 1;
}

await main();
