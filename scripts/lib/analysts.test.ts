import { describe, expect, it } from 'vitest';
import { decodeXml, mergeVideos, parseFeed } from './analysts';

const entry = (id: string, title: string, published: string, link = `https://www.youtube.com/watch?v=${id}`) => ` <entry>
  <id>yt:video:${id}</id>
  <yt:videoId>${id}</yt:videoId>
  <yt:channelId>UCRvqjQPSeaWn-uEx-w0XOIg</yt:channelId>
  <title>${title}</title>
  <link rel="alternate" href="${link}"/>
  <published>${published}</published>
  <media:group><media:title>${title}</media:title></media:group>
 </entry>`;

const feed = (...entries: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>Benjamin Cowen</title>
 <published>2019-06-14T05:33:32+00:00</published>
${entries.join('\n')}
</feed>`;

describe('YouTube 頻道的 RSS', () => {
  it('讀出影片 ID、標題、上傳時間；頻道本身的標題和時間不算一支影片', () => {
    const v = parseFeed(
      feed(
        entry('szWg0zCAbF0', 'Bitcoin: The Bears Strike Back', '2026-11-06T15:05:37+00:00'),
        entry('aYrDQOrtY3A', 'S&amp;P 500 &quot;Reality&quot; &#39;Check&#39;', '2026-11-05T15:37:08+00:00'),
      ),
    );
    expect(v).toEqual([
      { id: 'szWg0zCAbF0', title: 'Bitcoin: The Bears Strike Back', published: '2026-11-06T15:05:37.000Z' },
      { id: 'aYrDQOrtY3A', title: `S&P 500 "Reality" 'Check'`, published: '2026-11-05T15:37:08.000Z' },
    ]);
  });

  it('Shorts（短影片）標記出來', () => {
    const v = parseFeed(feed(entry('2FrzGDeTpC0', 'Clip', '2026-10-31T20:19:43+00:00', 'https://www.youtube.com/shorts/2FrzGDeTpC0')));
    expect(v[0]!.short).toBe(true);
  });

  it('缺欄位或格式不對的項目略過', () => {
    expect(parseFeed(feed(entry('bad', 'x', '2026-11-06T00:00:00Z'), entry('szWg0zCAbF0', 'x', 'not a date')))).toEqual([]);
    expect(parseFeed('<html>Sorry</html>')).toEqual([]);
  });

  it('XML 的特殊字元', () => {
    expect(decodeXml('A &amp; B &lt;3 &#x1F600; <![CDATA[raw & text]]>')).toBe('A & B <3 😀 raw & text');
  });
});

describe('合併新舊清單', () => {
  const v = (id: string, published: string, title = id) => ({ id: id.padEnd(11, 'x'), title, published });

  it('RSS 只有最近 15 支：舊的保留，新的加上去，依時間新到舊', () => {
    const merged = mergeVideos([v('b', '2026-11-02T00:00:00.000Z'), v('a', '2026-11-01T00:00:00.000Z')], [v('c', '2026-11-03T00:00:00.000Z'), v('b', '2026-11-02T00:00:00.000Z', '改過的標題')]);
    expect(merged.map((x) => x.title)).toEqual(['c', '改過的標題', 'a']);
  });

  it('超過上限時丟掉最舊的', () => {
    const merged = mergeVideos([v('a', '2026-11-01T00:00:00.000Z'), v('b', '2026-11-02T00:00:00.000Z')], [v('c', '2026-11-03T00:00:00.000Z')], 2);
    expect(merged.map((x) => x.title)).toEqual(['c', 'b']);
  });
});
