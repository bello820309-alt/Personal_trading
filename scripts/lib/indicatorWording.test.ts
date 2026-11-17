import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * 指標卡片的說明是程式當場產生的，新手會照著做判斷。
 * 規則：不能憑印象寫「常常、容易反彈」這類話；
 * 想說「之後通常怎麼走」，就用 math/after.ts 的 afterStats／zoneNote 從資料數出來，
 * 或寫成「一般的說法是…」「有人認為…」，讓人知道這不是驗證過的事。
 * （2026/11 實驗期間，這類沒驗證的句子出錯過好幾次；用資料一算，有幾句根本不成立。）
 */

/** 這個測試放在 scripts（那裡才有 Node 的型別），檢查的是 src/indicators */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/indicators');

const BANNED = [/常常/, /往往/, /多半/, /經常/, /很常見/, /不少/, /容易(反彈|回檔|止跌|失準|出現|遇到)/, /通常會/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe('指標說明的用字', () => {
  it('src/indicators 裡不出現沒有根據的頻率用語', () => {
    const hits: string[] = [];
    for (const f of files(ROOT)) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
          for (const re of BANNED) if (re.test(line)) hits.push(`${f.replace(ROOT, '')}:${i + 1} ${re} ${t.slice(0, 60)}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
