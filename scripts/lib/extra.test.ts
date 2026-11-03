import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  dailyAverage,
  mergeDaily,
  monthsBetween,
  parseBinanceFundingCsv,
  parseCoinMetrics,
  parseCoinMetricsFunding,
  parseFearGreed,
  validateSeries,
} from './extra';
import { readFirstZipEntry } from './zip';

/* 依各個公開 API 文件的格式手工組出來的回應（不是真實資料），用來驗證解析邏輯 */

/** 組一個只有一個檔案的 zip（和幣安公開資料的月檔一樣的結構） */
function makeZip(name: string, content: string, deflate = true): Buffer {
  const data = Buffer.from(content);
  const comp = deflate ? deflateRawSync(data) : data;
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(deflate ? 8 : 0, 10);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, comp, cd, nameBuf, eocd]);
}

describe('zip（幣安公開資料的月檔）', () => {
  it('讀得出 deflate 壓縮與未壓縮的檔案', () => {
    const csv = 'calc_time,funding_interval_hours,last_funding_rate\n1704067200000,8,0.0001\n';
    expect(readFirstZipEntry(makeZip('BTCUSDT-fundingRate-2024-01.csv', csv)).data.toString()).toBe(csv);
    expect(readFirstZipEntry(makeZip('a.csv', 'x,y', false))).toMatchObject({ name: 'a.csv' });
    expect(() => readFirstZipEntry(Buffer.from('not a zip at all, definitely not'))).toThrow('不是 zip 檔');
  });
});

describe('恐懼貪婪指數', () => {
  it('時間戳記換成日期、由舊到新排序', () => {
    const json = {
      data: [
        { value: '25', value_classification: 'Extreme Fear', timestamp: '1704153600' },
        { value: '60', value_classification: 'Greed', timestamp: '1704067200' },
      ],
    };
    expect(parseFearGreed(json)).toEqual({ t: ['2024-01-01', '2024-01-02'], v: [60, 25] });
    expect(() => parseFearGreed({ data: [] })).toThrow('沒有資料');
  });
});

describe('Coin Metrics 社群版', () => {
  it('取出指定的欄位，略過空值', () => {
    const rows = [
      { asset: 'btc', time: '2024-01-02T00:00:00.000000000Z', AdrActCnt: '900000' },
      { asset: 'btc', time: '2024-01-01T00:00:00.000000000Z', AdrActCnt: '850000' },
      { asset: 'btc', time: '2024-01-03T00:00:00.000000000Z' },
    ];
    expect(parseCoinMetrics(rows, 'AdrActCnt')).toEqual({ t: ['2024-01-01', '2024-01-02'], v: [850000, 900000] });
  });
});

describe('資金費率', () => {
  it('幣安 CSV（有或沒有標題列）→ 每天平均', () => {
    const withHeader = 'calc_time,funding_interval_hours,last_funding_rate\n1704067200000,8,0.0001\n1704096000000,8,0.0003\n1704153600000,8,-0.0002\n';
    const pts = parseBinanceFundingCsv(withHeader);
    expect(pts).toHaveLength(3);
    const daily = dailyAverage(pts);
    expect(daily.t).toEqual(['2024-01-01', '2024-01-02']);
    expect(daily.v[0]).toBeCloseTo(0.0002, 12);
    expect(daily.v[1]).toBeCloseTo(-0.0002, 12);
    expect(parseBinanceFundingCsv('1704067200000,8,0.0001')).toEqual([[1704067200000, 0.0001]]);
  });
  it('Coin Metrics 的格式', () => {
    const pts = parseCoinMetricsFunding([{ market: 'binance-BTCUSDT-future', time: '2024-01-01T08:00:00.000000000Z', rate: '0.0001' }]);
    expect(dailyAverage(pts)).toEqual({ t: ['2024-01-01'], v: [0.0001] });
  });
  it('新資料接在歷史後面，同一天以新的為準', () => {
    expect(mergeDaily({ t: ['2024-01-01', '2024-01-02'], v: [1, 2] }, { t: ['2024-01-02', '2024-01-03'], v: [20, 3] })).toEqual({
      t: ['2024-01-01', '2024-01-02', '2024-01-03'],
      v: [1, 20, 3],
    });
  });
});

describe('資料檢查', () => {
  const days = (n: number, v: (i: number) => number) => ({
    t: Array.from({ length: n }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)),
    v: Array.from({ length: n }, (_, i) => v(i)),
  });
  it('正常的資料沒有問題', () => {
    expect(validateSeries('fng', days(100, (i) => i % 100), null)).toEqual([]);
  });
  it('超出合理範圍、資料太少、比上一版少很多都會擋下', () => {
    expect(validateSeries('fng', days(100, () => 150), null).join()).toContain('不合理');
    expect(validateSeries('fng', days(10, () => 50), null).join()).toContain('資料太少');
    expect(validateSeries('fng', days(100, () => 50), days(200, () => 50)).join()).toContain('資料變少');
  });
  it('月份清單', () => {
    expect(monthsBetween('2019-11', '2020-02')).toEqual(['2019-11', '2019-12', '2020-01', '2020-02']);
  });
});
