/*
 * 分析師追蹤的現況（給主持人每天回報用）：每個預測的狀態、最近的新影片。
 *
 *   npm run -s analysts -- [--since 2026-11-06T07:43:00Z]
 *
 * --since：列出這個時間之後上傳的影片（預設 24 小時內）。判斷方式和網頁一樣（src/analysts/evaluate.ts）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateNotes, STATUS_LABELS, trackRecord } from '../src/analysts/evaluate.ts';
import { progressText } from '../src/analysts/format.ts';
import type { AnalystIndex, AnalystNotesFile, AnalystVideoFile, CallAsset } from '../src/analysts/types.ts';
import { completedLength, parseAssetFile } from '../src/data/parse.ts';
import type { AssetDataFile, Candle } from '../src/data/types.ts';
import { localTime, TAIPEI, taipeiDate } from '../src/lab/time.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = <T>(...p: string[]): T => JSON.parse(readFileSync(join(root, 'public', ...p), 'utf8')) as T;

const args = process.argv.slice(2);
const sinceArg = args[args.indexOf('--since') + 1];
const since = args.includes('--since') && sinceArg ? Date.parse(sinceArg) : Date.now() - 24 * 3600_000;
if (!Number.isFinite(since)) {
  console.error('✗ --since 要是時間，例如 2026-11-06T07:43:00Z');
  process.exit(1);
}

const candles: Partial<Record<CallAsset, Candle[]>> = {};
for (const id of ['0050', 'VOO', 'BTC'] as const) {
  const s = parseAssetFile(read<AssetDataFile>('data', `${id}.json`));
  candles[id] = s.candles.slice(0, completedLength(s));
}
const now = Date.now();
const today = taipeiDate(now);
const year = Number(today.slice(0, 4));
const when = (iso: string) => {
  const t = localTime(Date.parse(iso), TAIPEI);
  return `${t.date} ${t.hm}`;
};

for (const a of read<AnalystIndex>('analysts', 'index.json').analysts) {
  const notesPath = join(root, 'public', 'analysts', `${a.id}.json`);
  const notes = existsSync(notesPath) ? read<AnalystNotesFile>('analysts', `${a.id}.json`).notes : [];
  const calls = evaluateNotes(notes, candles, today);
  const r = trackRecord(calls);
  console.log(`【${a.name}】說對 ${r.hit}、說錯 ${r.miss}、條件沒發生 ${r.void}、等待結果 ${r.pending}`);
  for (const c of calls) {
    console.log(`- [${STATUS_LABELS[c.result.status]}] ${c.call.text}（期限 ${c.call.by}，${c.call.id}）`);
    console.log(`  ${progressText(c.call, c.result, year)}`);
  }
  const videosPath = join(root, 'public', 'analysts', `${a.id}.videos.json`);
  if (!existsSync(videosPath)) {
    console.log('（還沒有影片清單）');
    continue;
  }
  const vf = read<AnalystVideoFile>('analysts', `${a.id}.videos.json`);
  const done = new Set(notes.map((n) => n.videoId));
  const fresh = vf.videos.filter((v) => !v.short && Date.parse(v.published) > since);
  console.log(`新影片（${when(new Date(since).toISOString())} 之後，台灣時間）：${fresh.length ? '' : '沒有'}`);
  for (const v of fresh) console.log(`- ${when(v.published)} ${v.title}${done.has(v.id) ? '（已整理）' : ''} https://youtu.be/${v.id}`);
  console.log(`（影片清單最近一次更新：${when(vf.fetchedAt)}）`);
}
