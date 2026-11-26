import { describe, expect, it } from 'vitest';
import { lastDate, toCompact, type ExtraDataFile } from '../extra';
import { appendFunding, parseFundingRates, topUpFunding } from './funding';

const file = (): ExtraDataFile => ({
  schemaVersion: 1,
  asset: 'BTC',
  updatedAt: '2026-11-26T07:00:00Z',
  series: {
    funding: { label: '資金費率', unit: '比例', source: '幣安公開資料（月檔）', ...toCompact(['2026-10-30', '2026-10-31'], [0.0001, 0.0002]) },
  },
});
const ms = (iso: string) => Date.parse(iso);
const rows = [
  { symbol: 'BTCUSDT', fundingTime: ms('2026-11-01T00:00:00Z'), fundingRate: '0.00010000' },
  { symbol: 'BTCUSDT', fundingTime: ms('2026-11-01T08:00:00Z'), fundingRate: '0.00030000' },
  { symbol: 'BTCUSDT', fundingTime: ms('2026-11-03T16:00:00Z'), fundingRate: '-0.00005000' },
  { symbol: 'BTCUSDT', fundingTime: ms('2026-11-04T00:00:00Z'), fundingRate: '0.00090000' }, // 「今天」還沒過完，不用
];

describe('瀏覽器補資金費率的最近幾天', () => {
  it('每天平均、接在月檔後面；沒資料的日子留空；今天不接', () => {
    const out = appendFunding(file(), parseFundingRates(rows), ms('2026-11-04T00:00:00Z'));
    const f = out.series.funding!;
    expect(lastDate(f)).toBe('2026-11-03');
    expect(f.v).toEqual([0.0001, 0.0002, 0.0002, null, -0.00005]);
    expect(f.source).toContain('幣安 API');
  });

  it('API 被擋、格式不對或沒有新資料時，照舊', async () => {
    const f = file();
    const blocked = (async () => new Response('{"code":0,"msg":"restricted"}', { status: 451 })) as typeof fetch;
    expect(await topUpFunding(f, blocked, ms('2026-11-26T10:00:00Z'))).toBe(f);
    const broken = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await topUpFunding(f, broken, ms('2026-11-26T10:00:00Z'))).toBe(f);
    expect(appendFunding(f, parseFundingRates({ msg: 'x' }), ms('2026-11-26T00:00:00Z'))).toBe(f);
  });

  it('資料已經到昨天就不呼叫 API', async () => {
    let called = 0;
    const spy = (async () => {
      called++;
      return new Response('[]');
    }) as typeof fetch;
    await topUpFunding(file(), spy, ms('2026-11-01T10:00:00Z'));
    expect(called).toBe(0);
    await topUpFunding(file(), spy, ms('2026-11-26T10:00:00Z'));
    expect(called).toBe(1);
  });
});
