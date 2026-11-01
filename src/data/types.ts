/** 一根 K 棒。time 是交易所當地日期（YYYY-MM-DD）。價格已經做過分割調整。 */
export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DividendEvent {
  date: string;
  amount: number;
}

export interface SplitEvent {
  date: string;
  numerator: number;
  denominator: number;
}

/** public/data/{id}.json 的格式（由 scripts/fetch-data.ts 產生，以欄位陣列儲存比較省空間） */
export interface AssetDataFile {
  schemaVersion: 1;
  id: string;
  symbol: string;
  source: string;
  currency: string;
  timezone: string;
  /** 抓取時間（ISO 8601, UTC） */
  updatedAt: string;
  /** 最後一根 K 棒是否已經收盤（盤中抓到的會是 false） */
  lastBarComplete: boolean;
  events: { dividends: DividendEvent[]; splits: SplitEvent[] };
  bars: {
    t: string[];
    o: number[];
    h: number[];
    l: number[];
    c: number[];
    v: number[];
    /** 還原權息後的收盤價（含配息與分割調整） */
    ac: number[];
  };
}

export type ManifestStatus = 'ok' | 'stale' | 'missing';

export interface ManifestEntry {
  id: string;
  symbol: string;
  status: ManifestStatus;
  updatedAt?: string;
  lastDate?: string;
  bars?: number;
  error?: string;
}

export interface DataManifest {
  schemaVersion: 1;
  generatedAt: string;
  assets: ManifestEntry[];
}

/** 載入之後在 App 裡使用的形式 */
export interface AssetSeries {
  id: string;
  meta: Omit<AssetDataFile, 'bars'>;
  /** 分割調整後的 K 棒（和券商報價一致） */
  candles: Candle[];
  /** 對應每根 K 棒的還原權息收盤價 */
  adjClose: number[];
}
