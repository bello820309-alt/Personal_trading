# 分析師追蹤怎麼運作

網站的「分析師追蹤」頁（`#/analysts`）記錄追蹤的分析師在 YouTube 影片裡說了什麼，之後用本站的收盤資料對照說得準不準。

## 資料在哪裡

都在 `public/analysts/`：

| 檔案 | 內容 | 誰更新 |
|---|---|---|
| `index.json` | 追蹤哪些分析師：代號、名字、YouTube 頻道 ID 和網址、介紹、開始追蹤的日期 | 人工（Claude） |
| `{代號}.json` | 每支整理過的影片：中文標題、一句話總結、看法（偏多／偏空）、重點、預測、他也提醒的事、本站相關頁面 | 人工（Claude，從使用者貼的逐字稿整理） |
| `{代號}.videos.json` | 頻道最近的影片清單（標題、上傳時間、是不是 Shorts） | `npm run fetch-analysts`，GitHub Actions 每次抓行情時一起執行；清單沒變就不寫檔 |

格式定義在 `src/analysts/types.ts`；`scripts/lib/analystFiles.test.ts` 會檢查人工整理的檔案（期限要在上傳日之後、條件價位和目標不能反過來等等），改完一定要跑 `npm test`。

## 為什麼影片內容要使用者貼

YouTube 會擋雲端主機（Claude 的環境和 GitHub Actions 都是）：影片頁和字幕都要求「登入以確認你不是機器人」，只有頻道的 RSS（`https://www.youtube.com/feeds/videos.xml?channel_id=…`）讀得到，所以只能自動抓影片清單。

使用者在電腦上打開影片 → 說明欄「…更多」→「顯示轉錄稿」→ 全選複製 → 貼給 Claude。不要用使用者的 YouTube 帳號登入資訊去抓（帳號可能被封鎖）。逐字稿本身不放進 repo（是分析師的內容），只放整理後的重點和很短的原話。

## 收到逐字稿之後

1. 確認是哪一支影片：用 `{代號}.videos.json` 找影片 ID 和上傳時間（`published`），或用標題、內容判斷；找不到就用 `curl` 讀 RSS。
2. 在 `{代號}.json` 的 `notes` 最前面加一筆（新的在前）：
   - `summary` 一句話；`points` 8～10 項，白話、寫給新手看，專有名詞第一次出現要解釋。
   - `views` 每個主題（比特幣、美股、總體經濟…）一筆，`stance` 是 bullish／bearish／neutral／mixed。
   - `calls` 只放**事後可以對照**的預測。他說的數字照他說的；他沒說清楚的（期限、目標），在 `basis` 寫出我們怎麼解讀，盡量用對他寬鬆的解讀。
     - 價格預測（`kind: "price"`）：`asset` 只能是 0050、VOO、BTC（本站有資料的）；`direction` down／up；`target`；有「如果先跌破 A」就加 `trigger`；`by` 是期限（該市場當地日期，含這一天）。
     - 其他預測（`kind: "event"`，例如利率決策）：到期後由 Claude 填 `result`（hit／miss／void）和 `resolution`（實際發生了什麼）。
     - 本站沒有資料的市場（例如那斯達克）只寫在 `views`／`points`，不放進 `calls`。
   - `tools`：影片裡用到、本站有教的工具（均線、成交量、消息面…）。
3. 跑 `npm test`、`npm run build`，用 `npm run lab:browse` 以外的方式（例如 Playwright）看一下頁面，commit、push（push 就會部署）。
4. 用中文跟使用者回報：這支影片的重點、記下了哪些預測、怎麼判斷。

## 怎麼判斷說對還是說錯（`src/analysts/evaluate.ts`）

- 只用已收盤的日 K，從影片上傳那天（該市場當地日期）的**隔天**開始算：上傳當天的 K 棒有一部分是上傳之前的價格。
- 期限內任何一天的最低價（看跌）或最高價（看漲）碰到目標，就是說對；資料到了期限那天還沒碰到，就是說錯。
- 有 `trigger` 的：先碰到條件價位才開始等目標（同一天都碰到也算）；到期都沒碰到條件價位，就是「條件沒發生」（不算對也不算錯）。
- 事件預測照人工標記；過了期限還沒標記，頁面會顯示「等主持人確認」。

## 每天的回報

主持人每天回報 AI 實驗時，最後加一段：`npm run -s analysts -- --since <昨天回報的時間>` 會列出每個預測的狀態和這段時間的新影片（判斷方式和網頁一樣）。

## 新增分析師

使用者給頻道網址（例如 `https://www.youtube.com/@benjaminjcowen`）。頻道頁的 HTML 裡有 `"channelId":"UC…"`（或 `<link rel="canonical" href=".../channel/UC...">`），用 `curl` 讀得到。在 `index.json` 加一筆，新增 `{代號}.json`（`notes` 先放空陣列），再跑 `NODE_USE_ENV_PROXY=1 npm run fetch-analysts` 產生影片清單（在 Claude 的雲端環境要加這個變數，Node 內建的 fetch 才會走代理）。

## 待辦

- **2026-12-10 以後**：Benjamin Cowen 11/6 的預測「聯準會 12 月會再升息」（`bc-2026-11-06-fed`）——看 12/9（美國時間）的實際決定，填 `result` 和 `resolution`；同時更新 `src/data/events.ts` 的 FOMC。
- AI 實驗期間（到 2026-12-04），參加者不能看這一頁：`scripts/lab/browse.cjs` 會擋 `/analysts`，`docs/lab/agent.md` 也有寫。實驗結束後如果想讓之後的實驗參加者看，再拿掉。
