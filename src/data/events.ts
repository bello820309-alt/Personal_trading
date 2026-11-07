/*
 * 消息面事件：聯準會利率決策（FOMC）、美國選舉、比特幣減半、加密貨幣與總經大事。
 *
 * 日期都是「美國時間」的那一天（FOMC 是公布決策的那天）。
 * 資料來源：FOMC 會議日期與決策取自聯準會官網的會議日曆與聲明
 *（https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm），其他事件取自公開新聞報導。
 *
 * 新的 FOMC 會議結束後，把結果加進下面的 FOMC 清單（日期, 變動幾碼）即可；利率路徑會自動算出來，
 * 並由 events.test.ts 檢查幾個公開的利率數字。
 */

export type EventGroup = 'hike' | 'cut' | 'hold' | 'election' | 'halving' | 'crypto' | 'macro';

export const EVENT_GROUP_LABELS: Record<EventGroup, string> = {
  hike: 'FOMC 升息',
  cut: 'FOMC 降息',
  hold: 'FOMC 利率不變',
  election: '美國選舉',
  halving: '比特幣減半',
  crypto: '加密貨幣大事',
  macro: '總經大事',
};

/** 圖上標記用的字 */
export const EVENT_GROUP_MARK: Record<EventGroup, string> = {
  hike: '升',
  cut: '降',
  hold: '平',
  election: '選',
  halving: '半',
  crypto: '幣',
  macro: '經',
};

export interface MarketEvent {
  date: string;
  group: EventGroup;
  title: string;
  detail?: string;
  /** FOMC：這次調整幾個百分點（0.25 = 1 碼），以及調整後的利率區間上限 */
  rate?: { change: number; upper: number; emergency?: boolean };
  /** 只和這些標的有關；沒寫代表全部標的都適用 */
  assets?: string[];
}

/** FOMC 公布決策的日期與調整幅度（碼，1 碼 = 0.25 個百分點）；emergency = 臨時會議緊急降息 */
const FOMC: [date: string, quarters: number, emergency?: true][] = [
  ['2014-01-29', 0], ['2014-03-19', 0], ['2014-04-30', 0], ['2014-06-18', 0], ['2014-07-30', 0], ['2014-09-17', 0], ['2014-10-29', 0], ['2014-12-17', 0],
  ['2015-01-28', 0], ['2015-03-18', 0], ['2015-04-29', 0], ['2015-06-17', 0], ['2015-07-29', 0], ['2015-09-17', 0], ['2015-10-28', 0], ['2015-12-16', 1],
  ['2016-01-27', 0], ['2016-03-16', 0], ['2016-04-27', 0], ['2016-06-15', 0], ['2016-07-27', 0], ['2016-09-21', 0], ['2016-11-02', 0], ['2016-12-14', 1],
  ['2017-02-01', 0], ['2017-03-15', 1], ['2017-05-03', 0], ['2017-06-14', 1], ['2017-07-26', 0], ['2017-09-20', 0], ['2017-11-01', 0], ['2017-12-13', 1],
  ['2018-01-31', 0], ['2018-03-21', 1], ['2018-05-02', 0], ['2018-06-13', 1], ['2018-08-01', 0], ['2018-09-26', 1], ['2018-11-08', 0], ['2018-12-19', 1],
  ['2019-01-30', 0], ['2019-03-20', 0], ['2019-05-01', 0], ['2019-06-19', 0], ['2019-07-31', -1], ['2019-09-18', -1], ['2019-10-30', -1], ['2019-12-11', 0],
  ['2020-01-29', 0], ['2020-03-03', -2, true], ['2020-03-15', -4, true], ['2020-04-29', 0], ['2020-06-10', 0], ['2020-07-29', 0], ['2020-09-16', 0], ['2020-11-05', 0], ['2020-12-16', 0],
  ['2021-01-27', 0], ['2021-03-17', 0], ['2021-04-28', 0], ['2021-06-16', 0], ['2021-07-28', 0], ['2021-09-22', 0], ['2021-11-03', 0], ['2021-12-15', 0],
  ['2022-01-26', 0], ['2022-03-16', 1], ['2022-05-04', 2], ['2022-06-15', 3], ['2022-07-27', 3], ['2022-09-21', 3], ['2022-11-02', 3], ['2022-12-14', 2],
  ['2023-02-01', 1], ['2023-03-22', 1], ['2023-05-03', 1], ['2023-06-14', 0], ['2023-07-26', 1], ['2023-09-20', 0], ['2023-11-01', 0], ['2023-12-13', 0],
  ['2024-01-31', 0], ['2024-03-20', 0], ['2024-05-01', 0], ['2024-06-12', 0], ['2024-07-31', 0], ['2024-09-18', -2], ['2024-11-07', -1], ['2024-12-18', -1],
  ['2025-01-29', 0], ['2025-03-19', 0], ['2025-05-07', 0], ['2025-06-18', 0], ['2025-07-30', 0], ['2025-09-17', -1], ['2025-10-29', -1], ['2025-12-10', -1],
  ['2026-01-28', 0], ['2026-03-18', 0], ['2026-04-29', 0], ['2026-06-17', 0], ['2026-07-29', 0], ['2026-09-16', 1], ['2026-10-28', 0],
];

/** 已公布、但還沒開的 FOMC 會議（公布決策的日期） */
export const UPCOMING_FOMC = ['2026-12-09'];

/** 2008 年 12 月起，利率區間是 0%～0.25%（清單開始之前的利率） */
const START_UPPER = 0.25;

const pct = (v: number) => `${v.toFixed(2)}%`;

function fomcEvents(): MarketEvent[] {
  let upper = START_UPPER;
  return FOMC.map(([date, q, emergency]) => {
    const change = q * 0.25;
    upper = Math.round((upper + change) * 100) / 100;
    const range = `${pct(Math.max(0, upper - 0.25))}～${pct(upper)}`;
    const group: EventGroup = q > 0 ? 'hike' : q < 0 ? 'cut' : 'hold';
    const title =
      q === 0
        ? `FOMC 利率不變（${range}）`
        : `${emergency ? '緊急' : 'FOMC '}${q > 0 ? '升息' : '降息'} ${Math.abs(q)} 碼（${q > 0 ? '+' : '−'}${Math.abs(change).toFixed(2)} 個百分點），利率 ${range}`;
    return { date, group, title, rate: { change, upper, ...(emergency ? { emergency } : {}) } };
  });
}

const OTHER_EVENTS: MarketEvent[] = [
  { date: '2014-11-04', group: 'election', title: '美國期中選舉', detail: '共和黨拿下參議院多數。' },
  { date: '2016-07-09', group: 'halving', title: '比特幣第 2 次減半', detail: '每個區塊的獎勵從 25 枚減為 12.5 枚。', assets: ['BTC'] },
  { date: '2016-11-08', group: 'election', title: '美國總統大選', detail: '川普當選。' },
  { date: '2017-12-17', group: 'crypto', title: '芝商所（CME）比特幣期貨上市', detail: '機構從此可以用期貨放空比特幣；這幾天也正好是 2017 年行情的最高點。', assets: ['BTC'] },
  { date: '2018-11-06', group: 'election', title: '美國期中選舉', detail: '民主黨拿下眾議院多數。' },
  { date: '2020-03-12', group: 'macro', title: '新冠疫情恐慌，全球市場重挫', detail: '比特幣單日大跌將近四成（「黑色星期四」），美股也接連熔斷。' },
  { date: '2020-05-11', group: 'halving', title: '比特幣第 3 次減半', detail: '每個區塊的獎勵從 12.5 枚減為 6.25 枚。', assets: ['BTC'] },
  { date: '2020-11-03', group: 'election', title: '美國總統大選', detail: '拜登當選。' },
  { date: '2021-04-14', group: 'crypto', title: '加密貨幣交易所 Coinbase 在美國掛牌上市', assets: ['BTC'] },
  { date: '2021-05-19', group: 'crypto', title: '中國重申加密貨幣禁令，市場大崩跌', assets: ['BTC'] },
  { date: '2021-09-24', group: 'crypto', title: '中國人民銀行宣布虛擬貨幣交易全面違法', assets: ['BTC'] },
  { date: '2021-10-19', group: 'crypto', title: '美國第一檔比特幣期貨 ETF（BITO）上市', assets: ['BTC'] },
  { date: '2022-05-09', group: 'crypto', title: 'Terra（LUNA／UST）穩定幣崩盤', assets: ['BTC'] },
  { date: '2022-06-13', group: 'crypto', title: '借貸平台 Celsius 凍結提款，加密市場重挫', assets: ['BTC'] },
  { date: '2022-11-08', group: 'crypto', title: '交易所 FTX 倒閉危機爆發（11/11 聲請破產）', assets: ['BTC'] },
  { date: '2022-11-08', group: 'election', title: '美國期中選舉', detail: '共和黨拿下眾議院多數。' },
  { date: '2023-03-10', group: 'macro', title: '矽谷銀行（SVB）倒閉，引發銀行業危機' },
  { date: '2023-06-15', group: 'crypto', title: '貝萊德（BlackRock）申請比特幣現貨 ETF', assets: ['BTC'] },
  { date: '2024-01-10', group: 'crypto', title: '美國核准比特幣現貨 ETF（1/11 開始交易）', assets: ['BTC'] },
  { date: '2024-04-20', group: 'halving', title: '比特幣第 4 次減半', detail: '每個區塊的獎勵從 6.25 枚減為 3.125 枚。', assets: ['BTC'] },
  { date: '2024-11-05', group: 'election', title: '美國總統大選', detail: '川普當選。' },
  { date: '2025-03-06', group: 'crypto', title: '美國總統簽署行政命令，成立「戰略比特幣儲備」', assets: ['BTC'] },
  { date: '2025-04-02', group: 'macro', title: '美國宣布「對等關稅」，全球股市重挫' },
  { date: '2025-10-10', group: 'crypto', title: '美國宣布對中國加徵 100% 關稅，加密貨幣史上最大規模爆倉（約 190 億美元）', assets: ['BTC'] },
  { date: '2026-11-03', group: 'election', title: '美國期中選舉（投票日）' },
];

export const EVENTS: MarketEvent[] = [...fomcEvents(), ...OTHER_EVENTS].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

export function eventsFor(assetId: string): MarketEvent[] {
  return EVENTS.filter((e) => !e.assets || e.assets.includes(assetId));
}

/** 利率真的有調整的那些決策 */
export const RATE_CHANGES = EVENTS.filter((e) => e.rate && e.rate.change !== 0);

/** 某一天適用的聯準會利率區間上限（公布決策當天起算） */
export function fedUpperAt(date: string): number {
  let upper = START_UPPER;
  for (const e of RATE_CHANGES) {
    if (e.date > date) break;
    upper = e.rate!.upper;
  }
  return upper;
}

export type Regime = 'hiking' | 'cutting' | 'steady';

export const REGIME_LABELS: Record<Regime, string> = {
  hiking: '升息期',
  cutting: '降息期',
  steady: '利率不變期',
};

export const REGIME_RULE = '升息期＝最近一次調整利率是升息，而且還不到一年；降息期＝最近一次是降息、還不到一年；利率不變期＝已經超過一年沒有調整利率。一年內又升又降時，看最近的那一次。';

const DAY = 86400000;

/** 這一天屬於哪一種利率環境（看最近一次利率調整的方向，以及距今多久） */
export function regimeAt(date: string): Regime {
  let last: MarketEvent | null = null;
  for (const e of RATE_CHANGES) {
    if (e.date > date) break;
    last = e;
  }
  if (!last) return 'steady';
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / DAY;
  if (days > 365) return 'steady';
  return last.rate!.change > 0 ? 'hiking' : 'cutting';
}
