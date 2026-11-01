// 用預先安裝的 Chromium（Playwright）把 public/favicon.svg 轉成 PWA 需要的 PNG 圖示。
// 執行：npm run icons（產生的 PNG 會直接 commit，部署時不需要再跑）
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 用 require 才會找到環境裡預先安裝的 Playwright（NODE_PATH）
const { chromium } = createRequire(import.meta.url)('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'pwa-192x192.png', size: 192, pad: 0 },
  { file: 'pwa-512x512.png', size: 512, pad: 0 },
  // maskable 圖示要留安全邊界（內容放在中間 80%）
  { file: 'maskable-icon-512x512.png', size: 512, pad: 0.1 },
  { file: 'apple-touch-icon-180x180.png', size: 180, pad: 0.06 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;width:${t.size}px;height:${t.size}px">` +
      svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</body></html>',
  );
  await page.screenshot({ path: join(outDir, t.file), omitBackground: false });
  console.log('✓', t.file);
}
await browser.close();
