/**
 * 印出每個指標「現在怎麼說」的卡片內容（結論、字數、每一點補充說明），用真實資料檢查說明寫得對不對。
 * 用法：npm run -s cards -- <0050|VOO|BTC> [指標代號,用逗號分隔]
 */
import { readFileSync } from 'node:fs';
import { INDICATORS } from '../src/indicators/registry';
const want = process.argv[2] ?? 'BTC';
const b = JSON.parse(readFileSync(`public/data/${want}.json`, 'utf8')).bars;
const c = b.t.map((t: string, i: number) => ({ time: t, open: b.o[i], high: b.h[i], low: b.l[i], close: b.c[i], volume: b.v[i] }));
const extra = want === 'BTC' ? JSON.parse(readFileSync('public/data/BTC_extra.json', 'utf8')) : null;
const ctx = { extra, volume: want === '0050' ? { divisor: 1000, unit: '張' } : undefined };
for (const def of INDICATORS) {
  let d;
  try { d = def.describe?.(c, def.compute(c, def.defaults, ctx), def.defaults); } catch (e) { console.log('!!', def.id, String(e).slice(0, 80)); continue; }
  if (!d) continue;
  if (process.argv[3] && !process.argv[3].split(',').includes(def.id)) continue;
  console.log(`\n## ${def.id}｜${d.headline}\n${d.detail}  [${d.detail.length}]`);
  for (const n of d.notes ?? []) console.log(`  ▸ ${n.title}：${n.text}`);
}
