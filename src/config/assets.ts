/*
 * 標的設定：要新增標的（例如台積電 2330.TW、^GSPC、ETH-USD），在 ASSETS 裡加一筆就好，
 * GitHub Actions 下一次執行時就會自動抓資料，App 也會自動出現這個標的。
 */

export type Market = 'tw' | 'us' | 'crypto';

export const MARKET_LABELS: Record<Market, string> = {
  tw: '台股',
  us: '美股',
  crypto: '加密貨幣',
};

export interface CostDefaults {
  /** 每次買或賣的手續費率（0.001425 = 0.1425%） */
  feeRate: number;
  /** 手續費折扣（1 = 不打折，0.6 = 6 折） */
  feeDiscount: number;
  /** 每筆最低手續費（原幣） */
  minFee: number;
  /** 賣出時的交易稅率 */
  sellTaxRate: number;
  /** 成本的白話說明 */
  notes: string[];
}

export interface AssetConfig {
  id: string;
  /** Yahoo Finance 代號 */
  symbol: string;
  name: string;
  shortName: string;
  fullName: string;
  market: Market;
  currency: 'TWD' | 'USD';
  currencySymbol: string;
  timezone: string;
  exchange: string;
  /** 給新手的一句介紹 */
  intro: string;
  pricePrecision: number;
  volume: {
    /** 顯示時要除以多少（台股 1 張 = 1000 股） */
    divisor: number;
    unit: string;
    label: string;
  };
  /** 是否週末也交易（用來產生未來日期，給一目均衡表的雲層用） */
  tradesOnWeekends: boolean;
  costs: CostDefaults;
  /**
   * 即時報價：在瀏覽器裡直接向交易所的公開 API 取得最新 K 棒，每分鐘更新。
   * 歷史資料仍來自每天抓的 Yahoo 資料，最新幾天由即時資料補上。
   */
  live?: { provider: 'binance'; symbol: string; label: string };
  /** 有額外資料（public/data/{id}_extra.json：市場情緒、合約、鏈上），目前只有比特幣 */
  extraData?: boolean;
  /** 只使用這一天以後的資料（資料來源在這之前有問題時使用） */
  historyStart?: string;
  /** historyStart 的原因（會顯示在 App 裡） */
  historyNote?: string;
}

export const ASSETS: AssetConfig[] = [
  {
    id: '0050',
    symbol: '0050.TW',
    name: '元大台灣50',
    shortName: '0050',
    fullName: '元大台灣卓越50證券投資信託基金',
    market: 'tw',
    currency: 'TWD',
    currencySymbol: 'NT$',
    timezone: 'Asia/Taipei',
    exchange: '臺灣證券交易所',
    intro: '追蹤台灣市值最大的 50 家公司（台積電占比最高），常被當成「台股大盤」的代表。',
    pricePrecision: 2,
    volume: { divisor: 1000, unit: '張', label: '成交量' },
    tradesOnWeekends: false,
    // Yahoo 在 2014 年以前的 0050 資料沒有做 2025 年「1 拆 4」的分割調整（價格是現在的 4 倍），
    // 和之後的資料接不起來，所以從 2014 年開始使用。
    historyStart: '2014-01-02',
    historyNote: '資料從 2014 年開始：Yahoo 在這之前的 0050 價格沒有做 2025 年「1 拆 4」的分割調整，和之後的資料接不起來。',
    costs: {
      feeRate: 0.001425,
      feeDiscount: 1,
      minFee: 20,
      sellTaxRate: 0.001,
      notes: [
        '手續費上限是成交金額的 0.1425%，買進、賣出各收一次，每筆最低 20 元。',
        '多數券商的電子下單有折扣，例如 6 折就把「手續費折扣」設成 0.6。',
        '賣出 ETF 時另收 0.1% 證券交易稅（股票是 0.3%）。',
      ],
    },
  },
  {
    id: 'VOO',
    symbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    shortName: 'VOO',
    fullName: 'Vanguard S&P 500 ETF',
    market: 'us',
    currency: 'USD',
    currencySymbol: 'US$',
    timezone: 'America/New_York',
    exchange: '紐約證券交易所（NYSE Arca）',
    intro: '追蹤美國 S&P 500 指數（美國 500 家大型公司），是買「標普 500」最常見的 ETF 之一。',
    pricePrecision: 2,
    volume: { divisor: 1, unit: '股', label: '成交量' },
    tradesOnWeekends: false,
    costs: {
      feeRate: 0,
      feeDiscount: 1,
      minFee: 0,
      sellTaxRate: 0,
      notes: [
        '美國券商多半免手續費，所以預設為 0；透過國內「複委託」通常有手續費（常見 0.1%～0.25%，有最低收費）。',
        '台灣投資人領 VOO 股息會被預扣 30% 稅，回測用的「還原權息」報酬會略高於實際拿到的。',
      ],
    },
  },
  {
    id: 'BTC',
    symbol: 'BTC-USD',
    name: '比特幣',
    shortName: 'BTC',
    fullName: 'Bitcoin（美元計價）',
    market: 'crypto',
    currency: 'USD',
    currencySymbol: 'US$',
    timezone: 'UTC',
    exchange: '全球加密貨幣交易所（Yahoo 彙整報價）',
    intro: '第一個、也是市值最大的加密貨幣。全年無休 24 小時交易，波動比股票大很多。',
    pricePrecision: 2,
    volume: { divisor: 1, unit: '美元', label: '成交值' },
    tradesOnWeekends: true,
    live: { provider: 'binance', symbol: 'BTCUSDT', label: '幣安 BTC/USDT' },
    extraData: true,
    costs: {
      feeRate: 0.001,
      feeDiscount: 1,
      minFee: 0,
      sellTaxRate: 0,
      notes: ['常見交易所手續費約 0.1%（買、賣各一次），實際依交易所與會員等級而定。'],
    },
  },
];

export function getAsset(id: string | undefined | null): AssetConfig | undefined {
  return ASSETS.find((a) => a.id === id);
}

export const DEFAULT_ASSET_ID = '0050';
