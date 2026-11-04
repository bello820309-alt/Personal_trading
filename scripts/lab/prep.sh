#!/usr/bin/env bash
# AI 模擬交易：主持人每天讓參加者操作前的準備，一個指令做完：
#   1. 拉最新的程式、說明和行情資料    2. 需要時安裝套件，建置網站
#   3. 在背景啟動網站（參加者用它看網站）  4. 結算成交    5. 列出資料日期和大家的成績
# 用法：bash scripts/lab/prep.sh        結束後停掉網站：pkill -f "[v]ite preview"
set -uo pipefail
cd "$(dirname "$0")/../.."
BRANCH=ccr-34fbc3aa-8mup3g
LOG=.lab
mkdir -p "$LOG"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "✗ 有還沒 commit 的改動，先弄清楚是什麼再執行："
  git status --short
  exit 1
fi
git pull -q --rebase origin "$BRANCH" || { echo "✗ git pull 失敗"; exit 1; }
echo "✓ 已更新到 $(git log --oneline -1)"
[ -d node_modules ] || npm ci --silent || { echo "✗ npm ci 失敗"; exit 1; }
if npm run -s build > "$LOG/build.log" 2>&1; then echo "✓ 網站建置完成"; else echo "✗ 網站建置失敗（看 $LOG/build.log）"; fi

pkill -f "[v]ite preview" 2>/dev/null || true
nohup npx vite preview --port 4173 --strictPort > "$LOG/preview.log" 2>&1 &
if curl -s -o /dev/null --retry 30 --retry-connrefused --retry-delay 1 http://localhost:4173/Personal_trading/; then
  echo "✓ 網站已啟動：http://localhost:4173/Personal_trading/"
else
  echo "✗ 網站沒有啟動（看 $LOG/preview.log）"
fi

echo
npm run -s lab -- settle
echo
npm run -s lab -- check || true
