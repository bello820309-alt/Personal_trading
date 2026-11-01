/** 每個指標的白話解說（給新手看的） */
export interface IndicatorContent {
  id: string;
  /** 一句話說明 */
  oneLiner: string;
  /** 生活化的比喻 */
  analogy: string;
  /** 原理（白話，每個元素一段） */
  principle: string[];
  /** 計算步驟 */
  steps: { text: string; formula?: string }[];
  /** 小例子（每行一句） */
  example?: string[];
  /** 怎麼看 */
  howToRead: { title: string; text: string }[];
  /** 用途 */
  uses: string[];
  /** 限制與常見誤區 */
  pitfalls: string[];
  /** 參數說明 */
  params: { name: string; text: string }[];
  /** 各市場的常用設定 */
  marketNotes: string[];
  /** 領先或落後、適合什麼盤勢 */
  kind: { timing: string; bestFor: string };
  /** 常見搭配 */
  combineWith: string[];
}

export interface BasicsArticle {
  id: string;
  title: string;
  summary: string;
  sections: { heading?: string; paragraphs: string[]; bullets?: string[] }[];
}

export interface GlossaryTerm {
  term: string;
  en?: string;
  text: string;
  /** 相關的指標 id 或基礎觀念 id */
  related?: { type: 'indicator' | 'basics'; id: string }[];
}
