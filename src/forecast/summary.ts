import type { AssetConfig } from '../config/assets';
import type { Candle } from '../data/types';
import { fmtDate, fmtNum, fmtPct, fmtPrice } from '../data/format';
import type { CheckResult, Forecast } from './analog';

/* 走勢預測的白話說明：全部依照計算出來的數字，用固定規則寫成句子 */

const pp = (x: number) => fmtNum(Math.abs(x) * 100, 1);

function rsiWord(r: number): string {
  if (r >= 70) return '超買';
  if (r >= 50) return '偏強';
  if (r >= 30) return '偏弱';
  return '超賣';
}

function volWord(v: number): string {
  if (v >= 1.3) return '比平常激烈';
  if (v <= 0.8) return '比平常平靜';
  return '和平常差不多';
}

/** 「現在」的狀態：最近的漲跌、趨勢位置、RSI、波動、離高點多遠 */
export function describeNow(f: Forecast, candles: Candle[], asset: AssetConfig): string {
  const [r1w, , r1m, , r3m, ma, rsi, vol, dd] = f.features as [number, number, number, number, number, number, number, number, number];
  return (
    `${asset.name}（以 ${fmtDate(candles[f.target]!.time)} 收盤為準）：近 1 週 ${fmtPct(r1w)}、近 1 個月 ${fmtPct(r1m)}、近 3 個月 ${fmtPct(r3m)}；` +
    `在 200 日均線${ma >= 0 ? '上方' : '下方'} ${pp(ma)}%；RSI ${fmtNum(rsi, 1)}（${rsiWord(rsi)}）；` +
    `最近 1 個月的波動是過去一年的 ${fmtNum(vol, 2)} 倍（${volWord(vol)}）；離一年內最高點 ${fmtPct(dd)}。`
  );
}

export function summarizeForecast(f: Forecast, candles: Candle[], asset: AssetConfig): string[] {
  const price = candles[f.target]!.close;
  const firstYear = candles[0]!.time.slice(0, 4);
  const out: string[] = [];
  out.push(
    `從 ${firstYear} 年以來的資料裡，找出 ${f.analogs.length} 個和現在最像的日子（彼此至少相隔 1 個月，而且之後 3 個月的結果都已經知道），再看它們之後怎麼走。`,
  );
  const m = f.horizons.find((h) => h.horizon.key === '1m')!;
  const s = m.stats;
  out.push(
    `它們之後 1 個月：${fmtPct(s.up, 0, false)} 上漲，中位數 ${fmtPct(s.median)}；八成的情況介於 ${fmtPct(s.p10)} 和 ${fmtPct(s.p90)} 之間，` +
      `換算成價格大約是 ${fmtPrice(price * (1 + s.p10), asset)} ～ ${fmtPrice(price * (1 + s.p90), asset)}。`,
  );
  const others = f.horizons.filter((h) => h.horizon.key !== '1m');
  out.push(others.map((h) => `${h.horizon.label}：${fmtPct(h.stats.up, 0, false)} 上漲，中位數 ${fmtPct(h.stats.median)}`).join('；') + '。');
  return out;
}

/** 放在預測數字旁邊的提醒：這個「八成範圍」過去實際上準不準 */
export function bandNote(check: CheckResult[]): string {
  if (check.length === 0) return '';
  const parts = check.map((r) => `${r.horizon.label.replace(/後$/, '')} ${fmtPct(r.coverage, 0, false)}`).join('、');
  const cov = check.map((r) => r.coverage);
  const tail =
    Math.min(...cov) < 0.7
      ? '低於 80% 代表範圍估得太窄，真實的漲跌常常超出這個範圍。'
      : Math.min(...cov) > 0.9
        ? '都超過 80%，範圍估得偏寬，屬於保守的估計。'
        : '接近 80%，範圍大致可信，但仍有大約兩成的機會跑到範圍外面。';
  return `這個範圍準不準？回頭檢驗時，實際結果落在「八成範圍」裡的比例：${parts}（理想是 80%）。${tail}`;
}

/** 回頭檢驗的結論：和「一直猜漲」比，以及預測範圍準不準 */
export function summarizeCheck(r: CheckResult): string[] {
  const out: string[] = [];
  const diff = r.hit - r.alwaysUp;
  const head = `回頭檢驗：從 ${fmtDate(r.from)} 到 ${fmtDate(r.to)}，每週用同樣的方法預測「${r.horizon.label}」的漲跌，共 ${r.tests} 次，猜對 ${fmtPct(r.hit, 0, false)}`;
  if (diff >= 0.05) {
    out.push(`${head}，比一直猜「漲」（${fmtPct(r.alwaysUp, 0, false)}）多 ${pp(diff)} 個百分點：有一點參考價值，但仍然常常猜錯。`);
  } else if (diff > -0.03) {
    out.push(`${head}，和一直猜「漲」（${fmtPct(r.alwaysUp, 0, false)}）差不多。也就是說，用過去相似的走勢來猜漲跌，並沒有比較準。`);
  } else {
    out.push(`${head}，反而比一直猜「漲」（${fmtPct(r.alwaysUp, 0, false)}）還低。用過去相似的走勢來猜漲跌並不可靠。`);
  }
  if (r.coverage < 0.7) {
    out.push(
      `實際結果落在「八成範圍」裡的只有 ${fmtPct(r.coverage, 0, false)}（理想是 80%）：真實的漲跌常常超出這個範圍，要把可能的範圍想得更寬一點。`,
    );
  } else if (r.coverage > 0.9) {
    out.push(`實際結果落在「八成範圍」裡的有 ${fmtPct(r.coverage, 0, false)}（理想是 80%）：範圍估得偏寬，屬於保守的估計。`);
  } else {
    out.push(`實際結果落在「八成範圍」裡的比例是 ${fmtPct(r.coverage, 0, false)}，接近理想的 80%：「可能的範圍」比「會漲還是會跌」更值得參考。`);
  }
  return out;
}
