/*
 * 分析師追蹤：記錄追蹤的分析師在影片裡說了什麼，之後用實際價格對照說得準不準。
 *
 * 檔案（都在 public/analysts/）：
 * - index.json：追蹤哪些分析師（人工維護）
 * - {id}.json：每支整理過的影片：重點、看法、預測（人工維護，從使用者貼的逐字稿整理）
 * - {id}.videos.json：頻道最近的影片清單（scripts/fetch-analysts.ts 每天自動從 YouTube 的 RSS 抓）
 */

export interface AnalystProfile {
  id: string;
  name: string;
  /** YouTube 頻道 ID（UC 開頭），用來抓 RSS */
  channelId: string;
  channelUrl: string;
  /** 一兩句介紹：講什麼、習慣用什麼方法 */
  intro: string;
  /** 開始追蹤的日期（YYYY-MM-DD，台灣時間） */
  since: string;
}

export interface AnalystIndex {
  schemaVersion: 1;
  analysts: AnalystProfile[];
}

export interface AnalystVideo {
  id: string;
  title: string;
  /** 上傳時間（ISO 8601） */
  published: string;
  /** YouTube Shorts（短影片，通常是剪輯片段，不整理） */
  short?: boolean;
}

export interface AnalystVideoFile {
  schemaVersion: 1;
  channelId: string;
  /** 最近一次成功抓到 RSS 的時間 */
  fetchedAt: string;
  /** 新的在前 */
  videos: AnalystVideo[];
}

/** 可以用本站的價格資料自動判斷的標的 */
export type CallAsset = '0050' | 'VOO' | 'BTC';

export type Stance = 'bullish' | 'bearish' | 'neutral' | 'mixed';

/** 對某個市場的整體看法 */
export interface AnalystView {
  /** 例如「比特幣」「美股（那斯達克）」「總體經濟」 */
  topic: string;
  stance: Stance;
  text: string;
}

interface CallBase {
  /** 全部預測裡唯一，例如 bc-2026-11-06-sweep */
  id: string;
  /** 他說了什麼（白話中文） */
  text: string;
  /** 影片裡的原話（英文，短短一句） */
  quote?: string;
  /** 期限（YYYY-MM-DD，含這一天；價格預測用該市場當地的日期） */
  by: string;
  /** 目標、期限是怎麼定的（他有說的照他說的，沒說清楚的寫出我們怎麼解讀） */
  basis: string;
}

/**
 * 價格預測：期限內碰到目標價就算說對（用每天的最高價、最低價）。
 * 有 trigger 的是「如果先跌破（漲破）某個價位，就會再跌（漲）到目標」：條件沒發生就不算對也不算錯。
 */
export interface PriceCall extends CallBase {
  kind: 'price';
  asset: CallAsset;
  direction: 'down' | 'up';
  target: number;
  trigger?: number;
}

/** 價格以外的預測（例如利率決策）：到期後由主持人人工標記 */
export interface EventCall extends CallBase {
  kind: 'event';
  result?: 'hit' | 'miss' | 'void';
  /** 實際發生了什麼 */
  resolution?: string;
}

export type AnalystCall = PriceCall | EventCall;

/** 一支整理過的影片 */
export interface AnalystNote {
  videoId: string;
  /** 上傳時間（ISO 8601；價格預測從這之後的下一根日 K 開始算） */
  published: string;
  title: string;
  titleZh: string;
  /** 一句話總結 */
  summary: string;
  views: AnalystView[];
  /** 重點，一項一句 */
  points: string[];
  calls: AnalystCall[];
  /** 他自己也提醒的事（例如不是叫你恐慌賣出） */
  caveats?: string[];
  /** 他用到的工具，在本站哪裡可以看 */
  tools?: { label: string; to: string }[];
  /** 整理的時間（ISO 8601） */
  addedAt: string;
}

export interface AnalystNotesFile {
  schemaVersion: 1;
  analyst: string;
  /** 新的在前 */
  notes: AnalystNote[];
}
