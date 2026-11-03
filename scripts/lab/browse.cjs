#!/usr/bin/env node
/*
 * 用瀏覽器打開「技術分析學堂」的一頁，印出畫面上的文字和這頁的連結（給 AI 參加者「看」網站用）。
 *
 * 用法：npm run lab:browse -- <網址路徑> [選項]
 *   路徑就是網址 # 後面那段，例如 /、/learn、/learn/rsi、/chart/BTC、/forecast?asset=0050
 *   --shot 檔名.png   另外存一張截圖（可以用看圖片的方式看 K 線圖）
 *   --full            截整頁（預設只截第一個畫面）
 *   --mobile          用手機的寬度打開
 *   --from 8000       文字很長時，從第幾個字開始印（看下一段）
 *   --max 8000        最多印幾個字
 *   --no-expand       不要自動展開可以收合的區塊
 *   --click 週K       先點畫面上寫著這幾個字的按鈕再讀（可以重複，例如 --click "週 K" --click "3 年"）
 *                     會先找按鈕、分頁、選項（例如標的切換的「比特幣」），找不到才點一般文字
 *   --help            顯示這份說明
 *
 * 「AI 實驗」頁（/lab）有參加者的紀錄，實驗期間不能用這個工具打開。
 *
 * 需要先在本機啟動網站：npm run build && npx vite preview --port 4173 --strictPort
 * 網址可以用環境變數 LAB_SITE 改（預設 http://localhost:4173/Personal_trading/）
 */
const { chromium } = require('playwright');

const WITH_VALUE = new Set(['shot', 'from', 'max']);
const FLAGS = new Set(['full', 'mobile', 'no-expand']);
const values = {};
const flags = new Set();
const clicks = [];
let route = '/';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const name = a.slice(2);
    if (name === 'click') clicks.push(args[++i]);
    else if (name === 'help') continue;
    else if (WITH_VALUE.has(name)) values[name] = args[++i];
    else if (FLAGS.has(name)) flags.add(name);
    else {
      console.error(`✗ 看不懂的選項：${a}`);
      process.exit(1);
    }
  } else {
    route = a;
  }
}
const opt = (name) => values[name];
const flag = (name) => flags.has(name);

if (args.includes('--help') || args.includes('-h')) {
  // 開頭那段註解就是說明
  const doc = require('node:fs').readFileSync(__filename, 'utf8').split('*/')[0];
  console.log(doc.replace(/^#!.*\n/, '').replace(/^\/\*\n?/, '').replace(/^ \* ?/gm, ''));
  process.exit(0);
}

/** 「AI 實驗」頁有參加者的紀錄，參加者不能看（避免看到另一位的資料） */
const BLOCKED = /^\/lab(\/|\?|$)/;
const site = (process.env.LAB_SITE || 'http://localhost:4173/Personal_trading/').replace(/\/?$/, '/');
const max = Number(opt('max') || 8000);
const from = Number(opt('from') || 0);
const shot = opt('shot');

async function main() {
  const path = route.startsWith('/') ? route : `/${route}`;
  if (BLOCKED.test(path)) {
    console.error('✗ 「AI 實驗」頁有參加者的紀錄，實驗期間參加者不能打開。');
    process.exitCode = 1;
    return;
  }
  const url = `${site}#${path}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(
      flag('mobile') ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } },
    );
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    } catch (e) {
      console.error(`✗ 打不開 ${url}：${e.message.split('\n')[0]}`);
      console.error('  網站可能還沒啟動：npm run build && npx vite preview --port 4173 --strictPort');
      process.exitCode = 1;
      return;
    }
    // 等資料載入、圖表和計算完成（比特幣的即時報價在這個環境連不上，不用等它）
    await page.waitForFunction(() => !document.body.innerText.includes('載入中'), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    for (const text of clicks) {
      // 先找按鈕、分頁、選項這類可以點的東西（例如標的的切換按鈕），找不到才用一般文字
      let target = null;
      for (const role of ['radio', 'tab', 'button', 'checkbox', 'link', 'option']) {
        const loc = page.getByRole(role, { name: text, exact: true });
        if ((await loc.count()) > 0) {
          target = loc.first();
          break;
        }
      }
      if (!target) {
        const exact = page.getByText(text, { exact: true });
        target = (await exact.count()) > 0 ? exact.first() : page.getByText(text).first();
      }
      try {
        await target.click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        console.log(`（已點「${text}」）`);
      } catch {
        console.log(`（找不到可以點的「${text}」）`);
      }
    }
    if (!flag('no-expand')) {
      for (let round = 0; round < 2; round++) {
        const closed = await page.$$('main details:not([open]) > summary');
        for (const s of closed) await s.click().catch(() => {});
        if (closed.length) await page.waitForTimeout(800);
      }
    }
    const { title, text, links } = await page.evaluate(() => {
      const main = document.querySelector('main');
      const seen = new Set();
      const links = [];
      for (const a of document.querySelectorAll('a[href^="#/"]')) {
        const href = a.getAttribute('href').slice(1);
        const label = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        if (!label || seen.has(href) || /^\/lab(\/|\?|$)/.test(href)) continue;
        seen.add(href);
        links.push(`${label.slice(0, 40)} → ${href}`);
      }
      return { title: document.title, text: (main ? main.innerText : document.body.innerText).replace(/\n{3,}/g, '\n\n'), links };
    });
    const part = text.slice(from, from + max);
    console.log(`=== ${title}｜${path} ===`);
    console.log(part);
    if (from + max < text.length) {
      console.log(`\n…（這頁還有 ${text.length - from - max} 個字，用 --from ${from + max} 看下一段）`);
    }
    console.log('\n=== 這頁可以點的連結 ===');
    console.log(links.slice(0, 80).join('\n'));
    if (shot) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: shot, fullPage: flag('full') });
      console.log(`\n截圖存在 ${shot}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
