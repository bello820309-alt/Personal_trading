/*
 * 分析師追蹤：解析 YouTube 頻道的 RSS（https://www.youtube.com/feeds/videos.xml?channel_id=…），
 * 和之前存下來的影片清單合併。抓取流程在 scripts/fetch-analysts.ts。
 *
 * RSS 只有最近 15 支影片，所以每次都和舊的清單合併，清單會越來越完整。
 */
import type { AnalystVideo } from '../../src/analysts/types.ts';

/** 最多保留幾支影片 */
export const MAX_VIDEOS = 300;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .trim();
}

const pick = (block: string, re: RegExp) => re.exec(block)?.[1];

/** RSS 裡的影片（新的在前）；格式不對的項目略過 */
export function parseFeed(xml: string): AnalystVideo[] {
  const out: AnalystVideo[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = m[1]!;
    const id = pick(block, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    const title = pick(block, /<title>([\s\S]*?)<\/title>/);
    const published = pick(block, /<published>([^<]+)<\/published>/);
    const link = pick(block, /<link rel="alternate" href="([^"]+)"/) ?? '';
    if (!id || !/^[\w-]{11}$/.test(id) || title === undefined || !published || !Number.isFinite(Date.parse(published))) continue;
    const v: AnalystVideo = { id, title: decodeXml(title), published: new Date(Date.parse(published)).toISOString() };
    if (link.includes('/shorts/')) v.short = true;
    out.push(v);
  }
  return out;
}

/** 合併新舊清單：同一支影片用新抓到的（標題可能改過），依上傳時間新到舊排列 */
export function mergeVideos(old: AnalystVideo[], fresh: AnalystVideo[], max = MAX_VIDEOS): AnalystVideo[] {
  const byId = new Map<string, AnalystVideo>();
  for (const v of old) byId.set(v.id, v);
  for (const v of fresh) byId.set(v.id, v);
  return [...byId.values()].sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id)).slice(0, max);
}

export function sameVideos(a: AnalystVideo[], b: AnalystVideo[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
