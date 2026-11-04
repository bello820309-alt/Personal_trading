/*
 * AI 模擬交易實驗的資料格式（public/lab/ 裡的 JSON）。
 * - experiment.json：實驗的設定（本金、期間、參加者）
 * - agent-{id}.json：每位參加者的下單紀錄、成交紀錄、每日心得
 * 下單由參加者用指令（npm run lab）寫入；成交由程式依照行情資料計算後寫入，參加者不能自己填成交價。
 */

export interface LabAgent {
  id: string;
  /** 顯示名稱，例如「新手 A」 */
  name: string;
  /** 一句話介紹 */
  intro: string;
  /** 只能買賣這些標的（專攻某一檔的參加者）；沒寫 = 實驗的所有標的 */
  assets?: string[];
}

export interface LabExperiment {
  schemaVersion: 1;
  title: string;
  /** 每位參加者的本金（新台幣） */
  capital: number;
  /** 第一個操作日（台灣日期） */
  start: string;
  /** 最後一個可以下單的日子（台灣日期） */
  end: string;
  /** 結算日：不能再下單，只寫最後的心得、算最後的成績 */
  wrapUp: string;
  /** 每天操作的時間（台灣時間 HH:MM），也是對照組「第一天買進」的時間 */
  runTime: string;
  /** 可以買賣的標的 */
  assets: string[];
  agents: LabAgent[];
  /** 對照用：照比例分批買進、之後都不動 */
  benchmark: {
    name: string;
    intro: string;
    weights: Record<string, number>;
    /** 分幾次買進（預設 1 = 第一天一次買完） */
    tranches?: number;
    /** 每隔幾天買一次（預設 7 = 每週） */
    everyDays?: number;
  };
}

export type OrderSide = 'buy' | 'sell';

export interface LabOrder {
  /** 例如 a-2026-11-04-1 */
  id: string;
  /** 下單時間（ISO 8601, UTC） */
  placedAt: string;
  /** 第幾天的操作（台灣日期） */
  day: string;
  asset: string;
  side: OrderSide;
  /** 買進：要花多少新台幣（含手續費） */
  amount?: number;
  /** 賣出：賣掉成交當時持有的百分之幾（1～100） */
  pct?: number;
  /** 為什麼這樣做 */
  reason: string;
  /** 取消的時間（只有還沒成交的單可以取消） */
  cancelledAt?: string;
}

export interface LabFill {
  orderId: string;
  /** filled = 成交；rejected = 沒有成交（例如沒有持股可以賣） */
  status: 'filled' | 'rejected';
  asset: string;
  side: OrderSide;
  /** 成交那根 K 棒的日期（交易所當地日期） */
  date: string;
  /** 成交時間（ISO 8601, UTC） */
  at: string;
  /** 成交價（原幣） */
  price?: number;
  /** 使用的匯率（1 美元 = 多少新台幣），只有美元計價的標的才有 */
  fx?: number;
  fxDate?: string;
  /** 成交數量（股或顆） */
  units?: number;
  /** 成交金額（新台幣，不含手續費與稅） */
  value?: number;
  /** 手續費（新台幣） */
  fee?: number;
  /** 交易稅（新台幣） */
  tax?: number;
  /** 現金的變化（新台幣）：買進是負的、賣出是正的 */
  cash?: number;
  /** 沒有成交的原因 */
  note?: string;
  /** 這筆成交紀錄是什麼時候算出來的 */
  settledAt: string;
}

export interface LabJournalEntry {
  /** 台灣日期 */
  day: string;
  writtenAt: string;
  /** 一句話總結今天 */
  summary: string;
  /** 對市場的看法：看了哪些指標、怎麼判斷 */
  market: string;
  /** 今天的決定和理由（下了什麼單，或為什麼不動） */
  decision: string;
  /** 今天學到的 */
  learned: string[];
  /** 看不懂、或覺得網站可以改進的地方 */
  confused: string[];
  /** 接下來的打算 */
  plan: string;
  /** 今天看了網站的哪些頁面 */
  pages: string[];
  /** 對今天決定的信心（1～5） */
  confidence?: number;
  /** 寫心得當時的總資產（程式自動填） */
  snapshot?: { value: number; cash: number; returnPct: number };
}

export interface LabAgentFile {
  schemaVersion: 1;
  id: string;
  orders: LabOrder[];
  fills: LabFill[];
  journal: LabJournalEntry[];
}
