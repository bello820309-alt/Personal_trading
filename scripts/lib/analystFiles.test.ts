import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSET_TZ } from '../../src/analysts/evaluate';
import type { AnalystIndex, AnalystNotesFile, AnalystVideoFile } from '../../src/analysts/types';
import { localTime } from '../../src/lab/time';

/*
 * public/analysts/ 裡的檔案是人工整理的（從使用者貼的逐字稿），這裡檢查格式，
 * 避免網頁讀到寫錯的資料（例如期限早於上傳日、條件價位和目標反了）。
 */

const DIR = new URL('../../public/analysts/', import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as T;
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));
const isTime = (s: unknown) => typeof s === 'string' && Number.isFinite(Date.parse(s));

const index = read<AnalystIndex>('index.json');

describe('追蹤的分析師（index.json）', () => {
  it('每位都有不重複的代號、頻道 ID 和網址', () => {
    expect(index.schemaVersion).toBe(1);
    expect(index.analysts.length).toBeGreaterThan(0);
    expect(new Set(index.analysts.map((a) => a.id)).size).toBe(index.analysts.length);
    for (const a of index.analysts) {
      expect(a.id).toMatch(/^[a-z0-9-]+$/);
      expect(a.channelId).toMatch(/^UC[\w-]{22}$/);
      expect(a.channelUrl).toMatch(/^https:\/\/www\.youtube\.com\//);
      expect(a.name && a.intro).toBeTruthy();
      expect(isDate(a.since)).toBe(true);
    }
  });
});

describe.each(index.analysts.map((a) => [a.name, a] as const))('%s 的整理', (_name, a) => {
  const file = read<AnalystNotesFile>(`${a.id}.json`);
  const callIds = new Set<string>();

  it('檔案屬於這位分析師，影片不重複，新的在前', () => {
    expect(file.schemaVersion).toBe(1);
    expect(file.analyst).toBe(a.id);
    expect(new Set(file.notes.map((n) => n.videoId)).size).toBe(file.notes.length);
    const times = file.notes.map((n) => Date.parse(n.published));
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });

  it.each(file.notes.map((n) => [n.title, n] as const))('「%s」的欄位都填好了', (_title, n) => {
    expect(n.videoId).toMatch(/^[\w-]{11}$/);
    expect(isTime(n.published) && isTime(n.addedAt)).toBe(true);
    expect(n.title && n.titleZh && n.summary).toBeTruthy();
    expect(n.points.length).toBeGreaterThan(0);
    for (const v of n.views) {
      expect(['bullish', 'bearish', 'neutral', 'mixed']).toContain(v.stance);
      expect(v.topic && v.text).toBeTruthy();
    }
    for (const t of n.tools ?? []) expect(t.to).toMatch(/^\//);
    for (const c of n.calls) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(callIds.has(c.id)).toBe(false);
      callIds.add(c.id);
      expect(c.text && c.basis).toBeTruthy();
      expect(isDate(c.by)).toBe(true);
      if (c.kind === 'price') {
        expect(Object.keys(ASSET_TZ)).toContain(c.asset);
        expect(['down', 'up']).toContain(c.direction);
        expect(c.target).toBeGreaterThan(0);
        // 期限要在上傳日（該市場當地日期）之後
        expect(c.by > localTime(Date.parse(n.published), ASSET_TZ[c.asset]).date).toBe(true);
        // 條件價位要在目標之前碰到：看跌時條件比目標高，看漲時比目標低
        if (c.trigger !== undefined) expect(c.direction === 'down' ? c.trigger > c.target : c.trigger < c.target).toBe(true);
      } else {
        expect(c.kind).toBe('event');
        if (c.result !== undefined) {
          expect(['hit', 'miss', 'void']).toContain(c.result);
          expect(c.resolution).toBeTruthy();
        }
      }
    }
  });

  it('自動抓的影片清單（有的話）：頻道相同、不重複、新的在前', () => {
    const name = `${a.id}.videos.json`;
    if (!existsSync(new URL(name, DIR))) return;
    const v = read<AnalystVideoFile>(name);
    expect(v.channelId).toBe(a.channelId);
    expect(new Set(v.videos.map((x) => x.id)).size).toBe(v.videos.length);
    const times = v.videos.map((x) => Date.parse(x.published));
    expect(times.every(Number.isFinite)).toBe(true);
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });
});
