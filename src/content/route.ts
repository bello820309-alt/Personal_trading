/**
 * 7 天新手路線：每天一個小任務，附上直接連到對應頁面的連結。
 * 「第一次使用」那篇基礎觀念和總覽頂端的路線卡都用這一份。
 */
export interface RouteDay {
  day: number;
  title: string;
  /** 今天要做的事（一兩句） */
  task: string;
  links: { label: string; to: string }[];
}

export const ROUTE_DAYS: RouteDay[] = [
  {
    day: 1,
    title: '看懂價格和 K 線',
    task: '先在總覽看三檔的最新價格，再讀「K 線怎麼看」：一根 K 棒的開盤、最高、最低、收盤是什麼，紅 K、綠 K 怎麼分。',
    links: [
      { label: '總覽', to: '/' },
      { label: 'K 線怎麼看', to: '/basics/candles' },
    ],
  },
  {
    day: 2,
    title: '趨勢和移動平均線',
    task: '讀「趨勢、盤整與支撐壓力」，再看移動平均線的解說：價格在均線上面、下面各代表什麼。',
    links: [
      { label: '趨勢、盤整與支撐壓力', to: '/basics/trend' },
      { label: '移動平均線', to: '/learn/sma?asset=0050' },
    ],
  },
  {
    day: 3,
    title: '自己動手看圖表',
    task: '到圖表頁加上均線、成交量和 RSI，左右滑動看過去幾次大漲大跌時它們怎麼變；試試右上方的「區間漲跌」。',
    links: [{ label: '圖表', to: '/chart/0050' }],
  },
  {
    day: 4,
    title: '「各指標目前怎麼說」和意見不一致時',
    task: '回到總覽，看每個指標的標籤（偏多、偏空、過熱、過冷），再展開「意見不一致時先看哪一個」：先用 ADX 分趨勢盤或盤整，再決定以哪一類為主。',
    links: [
      { label: '總覽的指標狀態', to: '/' },
      { label: 'ADX（趨向指標）', to: '/learn/dmi?asset=0050' },
      { label: 'RSI', to: '/learn/rsi?asset=0050' },
    ],
  },
  {
    day: 5,
    title: '回測：訊號和賺錢是兩回事',
    task: '用回測試「黃金交叉買、死亡交叉賣」，和「買了一直抱著」比；再看策略排行榜最上面那一句：有幾個策略真的贏過一直抱著。',
    links: [
      { label: '回測', to: '/backtest?asset=0050&strategy=ma-cross' },
      { label: '策略排行榜', to: '/backtest/rank?asset=0050' },
      { label: '回測要注意什麼', to: '/basics/backtest' },
    ],
  },
  {
    day: 6,
    title: '定期定額和消息面',
    task: '動態定投是「定期定額，再加上價格階梯（跌多買多、漲多買少）」，可以回測和一般定投比較；消息面看聯準會、選舉、減半這些大事前後，價格過去怎麼走。',
    links: [
      { label: '動態定投', to: '/backtest/dca?asset=0050' },
      { label: '消息面事件', to: '/backtest/events?asset=0050' },
    ],
  },
  {
    day: 7,
    title: '走勢預測、分析師追蹤、AI 實驗',
    task: '走勢預測是找過去和現在最像的日子，看它們之後怎麼走，給的是範圍不是答案；分析師追蹤記錄分析師在影片裡說了什麼，再用價格資料對照說得準不準；AI 實驗是五個 AI 新手用這個網站模擬交易一個月的紀錄。',
    links: [
      { label: '走勢預測', to: '/forecast?asset=0050' },
      { label: '分析師追蹤', to: '/analysts' },
      { label: 'AI 實驗', to: '/lab' },
    ],
  },
];

/** 存在瀏覽器裡的進度（完成的第幾天） */
export const ROUTE_STORAGE_KEY = 'beginner-route-v1';

export function parseRouteProgress(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= ROUTE_DAYS.length) : [];
  } catch {
    return [];
  }
}

/** 下一個還沒完成的是第幾天；全部完成時是 null */
export function nextRouteDay(done: readonly number[]): number | null {
  return ROUTE_DAYS.find((d) => !done.includes(d.day))?.day ?? null;
}
