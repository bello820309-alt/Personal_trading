# AI 模擬交易：主持人每天的流程

給主持人（Claude，在原本的對話裡）看的。每天台灣時間 15:43 左右，排程任務「AI 模擬交易：每天的操作」會在對話裡叫主持人跑一次。

原則：

- 主持人**不能給參加者任何投資建議或提示**，也不能改參加者寫的心得。只處理操作上的問題（指令錯誤、網站沒啟動、資料沒更新）。
- 兩位參加者要用**同樣的 prompt**、同時開始，互相獨立。
- 所有日期都用**台灣日期**。實驗設定在 `public/lab/experiment.json`（`start`、`end`、`wrapUp`）。

## 0. 今天要不要跑

- 今天在 `start` 之前：什麼都不做，只回一句「實驗還沒開始」。
- 今天在 `wrapUp` 之後：照最後一節「實驗結束之後」處理。
- 先跑一次 `npm run -s lab -- check`。如果兩位今天的心得都已經寫了（例如排程重複觸發），不要再叫參加者操作，只要確認有 commit 和 push。

## 1. 準備

```bash
cd /home/user/Personal_trading
git status --short          # 有沒有未 commit 的改動？有的話先弄清楚是什麼，不要直接丟掉
git pull --rebase origin ccr-34fbc3aa-8mup3g
[ -d node_modules ] || npm ci
npm run build
```

- 在背景啟動網站：`npx vite preview --port 4173 --strictPort`。用 Bash 的 `run_in_background`，`timeout` 設 7200000。
- 啟動前先確認 4173 埠沒有被舊的伺服器佔用。
- 確認 `curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/Personal_trading/` 回 200。
- build 失敗：先 `npm ci` 再 build 一次。還是失敗就照樣進行，告訴參加者今天網站打不開、只能用 `me` 和 `quote`，並在回報裡說明。

## 2. 確認資料有更新

`npm run -s lab -- check` 會列出每個標的最後一根 K 棒的日期。正常情況是：

- 0050：今天（平日）。
- VOO：前一個美股交易日。
- 比特幣、匯率：昨天。

如果比特幣不是昨天，或平日的 0050 不是今天：

1. 用 `mcp__github__actions_run_trigger` 觸發更新：
   - owner `bello820309-alt`，repo `Personal_trading`
   - workflow `update-and-deploy.yml`，ref `ccr-34fbc3aa-8mup3g`
   - inputs `{"only_if_changed": "true"}`
2. 等它跑完（大約 3 分鐘，用 `mcp__github__actions_list` 查），再 `git pull --rebase`。
3. 等不到也照樣繼續：成交會延到下一次。

## 3. 成交結算

```bash
npm run -s lab -- settle
```

## 4. 讓兩位參加者操作

用 Agent 工具開兩個 `general-purpose` 子代理：

- 在**同一則訊息**裡一起呼叫，`run_in_background: false`。
- 工作資料夾用 scratchpad 底下的 `lab/<今天>/a` 和 `lab/<今天>/b`，先建立好。scratchpad 的完整路徑看系統提示。

prompt 用下面的模板，只換掉 `<…>`。兩位除了代號、名字和資料夾，其他字完全一樣：

```
你是「AI 模擬交易實驗」的參加者「<名字>」（代號 <代號>）。今天是 <YYYY-MM-DD>（實驗第 <N> 天，共 30 天）。
請先完整讀 /home/user/Personal_trading/docs/lab/agent.md，照裡面的步驟完成今天的操作。
你的代號是 <代號>，每個指令的 --agent 都用它。你的工作資料夾是 <工作資料夾>（截圖和心得 JSON 放這裡）。
不要讀另一位參加者的檔案，也不要讀 docs/lab/coordinator.md。完成後照說明用 10 行以內回報。
```

- 結算日（`wrapUp`）在 prompt 最後加一句：「今天是結算日，不能下單，請照說明寫整個月的總結心得。」
- 子代理失敗或沒有寫心得：同樣的 prompt 再叫一次（只叫那一位），並在回報裡說明。

## 5. 檢查與存檔

```bash
npm run -s lab -- check     # 兩位今天的心得都要「已寫」，最後要是「檔案檢查沒有問題」
git add public/lab
git commit -m "lab: 第 <N> 天（<YYYY-MM-DD>）兩位新手的操作與心得" -m "<規定的結尾兩行>"
git push -u origin ccr-34fbc3aa-8mup3g
```

- commit 訊息的結尾要加對話裡規定的兩行（Co-Authored-By、Claude-Session）。
- push 失敗：先 `git pull --rebase origin ccr-34fbc3aa-8mup3g` 再推，網路錯誤最多重試 4 次（2、4、8、16 秒）。
- push 之後 GitHub 會自動部署，網站的「AI 實驗」頁幾分鐘後更新。
- 最後停掉背景的預覽伺服器（TaskStop）。

## 6. 回報使用者

用繁體中文，簡短：

- 第 N 天（日期）
- 新手 A：今天做了什麼（一句）、總資產與報酬
- 新手 B：同上
- 買了不動（對照）：總資產與報酬
- 兩位今天看不懂、值得注意的地方（有的話）
- 有任何問題也要說（資料沒更新、指令錯誤、子代理失敗）

不要評論誰做得對、誰做得錯，也不要預測行情。

## 實驗結束之後

`wrapUp` 那天照常跑完（參加者寫總結），然後：

1. 寫一份整個月的總結給使用者：
   - 三方的最後成績
   - 兩位做法的差異
   - 兩位學到的東西
   - 網站最需要改進的地方（整理兩位的「看不懂」）
2. 用 `mcp__claude-code-remote__list_triggers` 找名稱「AI 模擬交易：每天的操作」的排程任務，再用 `update_trigger` 把它停用（`enabled: false`）。
3. 告訴使用者排程已經停了。
