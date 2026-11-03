# 技術分析學堂

給新手的技術分析學習工具：看 **0050、VOO（S&P 500）、比特幣** 的真實價格，在圖上加入 25 個常見技術指標（比特幣另外有 5 個情緒、合約、鏈上指標），每個指標都有白話解說（怎麼運作、原理、用途、常見誤區），還能用過去的資料**回測**指標的買賣規則，和「買了一直抱著」比較。

電腦、手機都能用（手機可以「加入主畫面」，像 App 一樣開啟）。

> 本工具僅供學習技術分析之用，所有訊號與回測結果都不構成投資建議；過去的績效不代表未來。

## 功能

| 頁面 | 內容 |
|---|---|
| 總覽 | 三個標的的最新價格、常用指標「目前怎麼說」（白話＋偏多／偏空／過熱／過冷標籤）、績效比較（同一天各投入 10 萬，之後變成多少） |
| 圖表 | K 線＋指標（疊在 K 線上或獨立副圖）、日／週／月 K、區間切換、還原權息、買賣訊號標記、十字線數值、參數調整與常用設定（台股、美股、幣圈）、區間漲跌（點兩根 K 棒，看起點開盤到終點收盤漲跌多少，可用 ‹ › 微調） |
| 指標百科 | 30 個指標的原理、計算步驟與小例子、怎麼看、用途、限制、參數；在真實資料上示範；三個標的的回測摘要。另有 8 篇基礎觀念與名詞小辭典 |
| 回測 | **策略排行榜**：選一段期間（近幾年、單一年度、比特幣的大牛市／熊市、自訂日期），把所有指標的經典規則都回測一次，依勝率、總報酬、回撤排名，附白話結論；交易不到 5 次的不列入排名；並檢驗「冠軍換一段期間還有效嗎」與「每年的冠軍隔年排第幾」，以及這段期間的消息面。**消息面**：FOMC 利率決策（2014 年起每一次）、美國選舉、比特幣減半、加密貨幣與總經大事標在價格圖上，統計事件前後 1／7／30 天的漲跌並和平常的日子比較，再看升息期、降息期、利率不變期各自勝率最高的策略。**單一策略回測**：隔天開盤成交、扣手續費與交易稅；白話結論、績效表（總報酬、年化、最大回撤、勝率…）、資產曲線、實際買賣點、交易明細。**動態定投**：設定自己的價格階梯（例如比特幣基準 8 萬、每週 100 美元；跌到 7 萬買 120、6 萬買 150；漲到 9 萬買 50、10 萬買 30；11 萬以上開始賣 10%、12 萬賣 20%），可以每天／每週／每兩週／每月，賣出可以「每期都賣」或「每個價位只賣一次」；顯示這一期該買多少或賣多少，並回測和一般定投比較投入、總價值、報酬率、年化報酬（XIRR）、平均成本、賣出有沒有幫助。設定只存在自己的裝置 |
| 走勢預測 | **歷史類比法**（Analog Forecasting，也叫「相似走勢比對」，機器學習裡的 k 最近鄰 k-NN）：用 9 個數字描述「現在」（近 1 週～3 個月的漲跌、和 200 日均線的距離、RSI、波動、離一年高點多遠），從過去的資料找出最像的 30 天（彼此至少相隔 1 個月），看它們之後怎麼走（可以選 1 週、1 個月或 3 個月）：上漲的比例、中位數、八成範圍與換算價格，並把範圍畫在 K 線右邊；細節放在可以展開的區塊。**回頭檢驗**：過去 5 年每週假裝站在當天預測一次，和「一直猜漲」比較猜對漲跌的比例，並檢查實際結果落在八成範圍裡的比例，誠實告訴你這個方法準不準 |
| 設定 | 紅漲綠跌／綠漲紅跌、深色／淺色主題、資料更新狀態、安裝到手機的方法 |

### 30 個指標

- **趨勢**：簡單移動平均線（MA）、指數移動平均線（EMA）、黃金交叉／死亡交叉、MACD、DMI／ADX、拋物線 SAR、一目均衡表、SuperTrend、唐奇安通道
- **動能／擺盪**：RSI、KD（台灣算法）、威廉指標 %R、CCI、ROC／動量、乖離率 BIAS、Stochastic RSI、心理線 PSY
- **波動**：布林通道、ATR、肯特納通道
- **量能**：成交量與均量、OBV 能量潮、MFI 資金流量
- **價位**：費波那契回撤、樞軸點（支撐與壓力）
- **比特幣專屬**（只有比特幣能用）：恐懼貪婪指數、永續合約資金費率、MVRV（市值 ÷ 平均成本）、活躍地址數、算力帶（Hash Ribbons）

台灣使用者的在地細節：預設紅漲綠跌、0050 成交量以「張」顯示、KD 使用台灣的 1/3 平滑算法（起始值 50）、MACD 標示 DIF／MACD／OSC，並說明和國際叫法的差異。

## 一次性設定：讓網站上線（GitHub Pages）

1. 到 repo 的 **Settings → General**，最下面 **Danger Zone → Change visibility → Public**。
   （GitHub 免費方案只有公開 repo 可以使用 Pages。）
2. 到 **Settings → Pages → Build and deployment**，把 **Source** 設成 **GitHub Actions**。
3. 到 **Actions** 頁籤，選「更新行情資料並部署」→ **Run workflow**。
4. 幾分鐘後網站會出現在：<https://bello820309-alt.github.io/Personal_trading/>

之後每次 push 都會重新部署。

### 資料怎麼自動更新

這個 repo 的 GitHub 內建排程（workflow 裡的 `schedule`）很不穩定：11/1～11/2 一次都沒有執行，repo 擁有者在網頁上改過 cron 之後才偶爾執行，而且常常延遲或跳過，GitHub 也沒有顯示任何錯誤。所以另外由外部呼叫 GitHub 的「Run workflow」API 來觸發更新。不管是誰觸發的，都只有出現新的收盤資料才會寫入並重新部署，重複觸發沒有關係。

所有指標、回測、預測都是打開網頁時用最新的資料當場計算的，沒有寫死的結果；網頁一直開著時，每 30 分鐘（或從背景切回來時）會自動檢查有沒有新資料，有就重新計算。

- **目前**：Claude 的排程任務「觸發行情資料更新（0050／VOO）」會在週一到週六的台北 05:47（VOO 收盤後）和 14:47（0050 收盤後），喚醒專用的 session「行情資料更新觸發器（排程用）」去觸發一次更新。每次會用掉一點 Claude 用量。
- **想改成每小時、而且不用 Claude**：照下面的步驟設定免費的 [cron-job.org](https://cron-job.org)，設定好之後再把 Claude 的排程任務刪掉。

**1. 建立 token（只能操作這個 repo 的 Actions）**

1. 打開 <https://github.com/settings/personal-access-tokens/new>。
2. **Token name** 隨意填（例如 `cron-job`）；**Expiration** 選最長的期限。
3. **Repository access** 選 **Only select repositories**，再選 `Personal_trading`。
4. **Permissions → Repository permissions → Actions** 選 **Read and write**（其他都不用改）。
5. 按 **Generate token**，複製 `github_pat_` 開頭的那串文字（只會顯示一次）。

**2. 在 cron-job.org 建立排程**

1. 註冊並登入 <https://console.cron-job.org/>，按 **Create cronjob**。
2. **Title** 填 `更新行情資料`，**URL** 填：
   `https://api.github.com/repos/bello820309-alt/Personal_trading/actions/workflows/update-and-deploy.yml/dispatches`
3. **Execution schedule** 設成每小時一次（例如每小時的第 43 分）。
4. 到 **Advanced**：
   - **Request method**：`POST`
   - **Headers**：
     - `Accept`：`application/vnd.github+json`
     - `Authorization`：`Bearer <剛剛複製的 token>`
     - `X-GitHub-Api-Version`：`2022-11-28`
   - **Request body**：`{"ref":"ccr-34fbc3aa-8mup3g","inputs":{"only_if_changed":"true"}}`
5. 按 **Test run**，回應是 `204` 就成功了（Actions 頁面會多一筆執行），再按 **Create** 儲存。

`only_if_changed` 讓沒有新資料的那幾次只抓資料、不重新部署。token 到期前 GitHub 會寄信提醒，到時重新產生一個，換掉 `Authorization` 那一行即可；token 如果外流，到 GitHub **Settings → Developer settings → Personal access tokens** 刪除就會失效。

### 安裝到手機

- iPhone：用 Safari 打開網站 → 分享 → 加入主畫面。
- Android：用 Chrome 打開 → 選單 → 安裝應用程式（或加到主畫面）。

## 資料從哪裡來

- 三個標的都使用 **Yahoo Finance** 的公開資料（免費、不需金鑰、提供分割調整與還原權息價格）：`0050.TW`、`VOO`、`BTC-USD`。
- **GitHub Actions** 每天收盤後由排程觸發（見上方「資料怎麼自動更新」），只把「已收盤」的日 K 寫進 repo（有新資料才 commit 並重新部署）。也可以在 Actions 頁面手動執行。
- **比特幣即時價格**：網頁開著時，每分鐘直接向幣安公開 API（BTC/USDT，不需要金鑰）取得最新 K 棒，接在歷史資料後面；成交量會換算到和 Yahoo 彙整資料同一個量級。抓不到時會清楚標示目前顯示的是哪個時間的資料。
- 抓下來的資料會先**驗證**（日期順序、價格是否合理、單日漲跌是否異常、和上一版是否差太多），有問題就保留上一版資料、workflow 標示失敗，GitHub 會寄信通知。
- 資料存在 `public/data/*.json`，每次更新都會 commit，所以可以追蹤歷史。
- **比特幣的額外資料**（`public/data/BTC_extra.json`，每天和行情一起更新，任何一項失敗都保留上一版）：
  - 恐懼貪婪指數：[alternative.me](https://alternative.me/crypto/fear-and-greed-index/)（2018 年起）
  - 資金費率：[幣安公開資料](https://data.binance.vision/)的 BTCUSDT 永續合約月檔（2020 年起；每個月初補上上個月。幣安的 API 會擋美國的伺服器，所以不直接呼叫）
  - 活躍地址數、交易筆數、算力、MVRV：[Coin Metrics 社群版 API](https://docs.coinmetrics.io/packages/coin-metrics-community-data)（免費、限非商業用途）
  - 合約爆倉量的歷史資料幾乎都要付費（例如 CoinGlass API），目前沒有收錄。
- **消息面事件**寫在 `src/data/events.ts`：FOMC 的會議日期與決策取自[聯準會官網](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)，其他事件取自公開新聞報導。每次 FOMC 會議結束後，在清單裡加一行（日期, 升降幾碼）即可，利率路徑會自動算出，`events.test.ts` 會檢查幾個公開的利率數字。
- 已知處理：
  - Yahoo 在 2014 年以前的 0050 資料沒有做 2025 年「1 拆 4」的分割調整，所以 0050 從 2014-01-02 開始。
  - 股票的休市日（颱風假、分割停止交易期間），Yahoo 會補一根成交量為 0 的 K 棒，整理時會略過。
  - 還沒收盤的 K 棒不會寫進資料；比特幣今天的 K 棒來自幣安即時資料，會標示「尚未收盤」，回測不會使用。

## 本機開發

需要 Node.js 22 以上。

```bash
npm install
npm run dev            # 開發模式：http://localhost:5173/Personal_trading/
npm test               # 單元測試（指標、回測、資料整理）
npm run typecheck      # 型別檢查
npm run build          # 建置到 dist/
npm run preview        # 預覽建置結果
npm run fetch-data     # 抓最新行情到 public/data/（需要能連到 Yahoo Finance）
npm run validate-data  # 檢查 public/data/ 的資料是否合理
```

## 專案結構

```
src/
  config/assets.ts          標的設定（代號、名稱、幣別、成本…）← 新增標的改這裡
  indicators/
    types.ts                指標的統一格式（IndicatorDef）
    registry.ts             所有指標的註冊表 ← 新增指標要加進這裡
    math/core.ts            共用數學（SMA、EMA、Wilder 平滑、最高最低、交叉…）
    trend/ momentum/ volatility/ volume/ levels/   各指標的計算、訊號與白話描述
  content/                  指標解說、基礎觀念、名詞辭典（繁體中文）
  backtest/                 回測引擎、績效指標、白話結論
  forecast/                 走勢預測（歷史類比法）、回頭檢驗、白話結論
  components/               圖表（lightweight-charts）、選單、抽屜等元件
  pages/                    總覽、圖表、指標百科、回測、走勢預測、設定
scripts/
  fetch-data.ts             抓資料（GitHub Actions 每天執行）
  validate-data.ts          檢查資料
  lib/                      Yahoo 抓取、整理、驗證
public/data/                行情資料（由 GitHub Actions 產生）
.github/workflows/          排程抓資料＋部署、CI
```

## 新增一個標的

在 `src/config/assets.ts` 的 `ASSETS` 加一筆（例如台積電 `2330.TW`、S&P 500 指數 `^GSPC`、以太幣 `ETH-USD`），填好名稱、幣別、時區、成交量單位與交易成本，push 之後手動執行一次 workflow，App 就會出現這個標的。

## 新增一個指標（包括你自己設計的模型）

1. 在 `src/indicators/<分類>/` 新增一個檔案，照 `IndicatorDef` 的格式寫：
   - `compute()`：回傳和 K 棒等長的數列（資料不夠時填 `null`）
   - `signals()`（選填）：買進／賣出訊號，回測會使用
   - `describe()`（選填）：目前狀態的白話描述
   - `strategy`（選填）：回測規則的文字說明
2. 在 `src/content/indicators/` 加上它的解說。
3. 把它加進 `src/indicators/registry.ts` 的 `INDICATORS`。

完成後，圖表、指標百科、回測、總覽都會自動出現這個指標。測試（`npm test`）會自動檢查它有沒有解說、有沒有偷看未來的資料。

## 測試

- 指標計算和 [technicalindicators](https://github.com/anandanand84/technicalindicators) 套件交叉比對（SMA、EMA、RSI、MACD、布林通道、ATR、DMI、CCI、%R、OBV、MFI、ROC、StochRSI）。
- 台灣 KD、乖離率、心理線等用手算的小例子驗證。
- **因果性測試**：只用前段資料算出的結果，必須和用完整資料算的同一段完全一樣，確保訊號沒有用到未來的資料。
- 回測引擎用手工設計的價格驗證：隔天開盤成交、手續費（含最低 20 元）、證交稅、最大回撤、年化報酬。
- 資料整理用 Yahoo 回應的結構驗證：時區換算、空值、休市日、分割異常偵測、拒絕覆蓋可疑資料。

## 致謝與授權

- 圖表：[TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/)（Apache License 2.0，Copyright © 2025 TradingView, Inc.）。
- 行情資料：Yahoo Finance（僅供個人學習使用，可能有延遲或錯誤）。
