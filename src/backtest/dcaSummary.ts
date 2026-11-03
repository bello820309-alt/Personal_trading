import type { AssetConfig } from '../config/assets';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice } from '../data/format';
import type { Candle } from '../data/types';
import { CADENCE_LABELS, CADENCE_NOW, baseBounds, isAbove, isBelow, zoneAt, type DcaAction, type DcaPlan, type DcaResult, type LadderRule } from './dca';

/* 動態定投的白話說明：全部依照計算出來的數字，用固定規則寫成句子 */

const pp = (x: number) => fmtNum(Math.abs(x) * 100, 1);

/** 金額：整數不顯示小數；1000 以下的零頭顯示 2 位小數 */
export function money(v: number, asset: AssetConfig): string {
  const a = Math.abs(v);
  const digits = Number.isInteger(Math.round(a * 100) / 100) || a >= 1000 ? 0 : 2;
  return `${v < 0 ? '-' : ''}${fmtMoney(a, asset, digits)}`;
}

/** 持有數量：比特幣到小數 6 位，股票（可以買零股）到小數 3 位 */
export function unitsText(units: number, asset: AssetConfig): string {
  if (asset.market === 'crypto') return `${fmtNum(units, units >= 1 ? 4 : 6)} ${asset.shortName}`;
  return `${fmtNum(units, units >= 100 ? 1 : 3)} 股`;
}

const pctText = (pct: number) => `${fmtNum(pct, Number.isInteger(pct) ? 0 : 1)}%`;

/** 階梯的條件：「跌到 70,000 以下」「漲到 110,000 以上」 */
export function conditionText(r: LadderRule, plan: DcaPlan, asset: AssetConfig): string {
  if (isBelow(plan, r)) return `跌到 ${fmtPrice(r.price, asset)} 以下`;
  if (isAbove(plan, r)) return `漲到 ${fmtPrice(r.price, asset)} 以上`;
  return `${fmtPrice(r.price, asset)}（和基準價格一樣，不會用到）`;
}

/** 基準區間：「70,000～90,000 之間」 */
export function baseZoneText(plan: DcaPlan, asset: AssetConfig): string {
  const { low, high } = baseBounds(plan);
  const f = (v: number) => fmtPrice(v, asset);
  if (low !== null && high !== null) return `${f(low)}～${f(high)} 之間`;
  if (low !== null) return `${f(low)} 以上`;
  if (high !== null) return `${f(high)} 以下`;
  return '任何價格';
}

export function zoneText(ruleIndex: number, plan: DcaPlan, asset: AssetConfig): string {
  return ruleIndex < 0 ? baseZoneText(plan, asset) : conditionText(plan.rules[ruleIndex]!, plan, asset);
}

/** 這一階要做什麼：「每週買 US$120」「每週賣出持有的 10%」 */
export function actionText(a: DcaAction, plan: DcaPlan, asset: AssetConfig, when: string = CADENCE_LABELS[plan.cadence]): string {
  if (a.kind === 'buy') return a.amount > 0 ? `${when}買 ${money(a.amount, asset)}` : `${when}不買`;
  if (a.kind === 'sell') return plan.sellMode === 'every' ? `${when}賣出持有的 ${pctText(a.pct)}` : `賣出持有的 ${pctText(a.pct)}（每個價位一次）`;
  return `${when}不買也不賣`;
}

export interface NowAdvice {
  /** 現在落在哪一階 */
  zone: string;
  /** 這一期要做什麼 */
  action: string;
  /** 價格再往下、往上碰到哪個價位會換一階 */
  nextDown: string | null;
  nextUp: string | null;
}

/** 依照現在的價格，這一期該做什麼；以及再跌、再漲到哪裡會換一階 */
export function nowAdvice(plan: DcaPlan, price: number, asset: AssetConfig): NowAdvice {
  const z = zoneAt(plan, price);
  const now = CADENCE_NOW[plan.cadence];
  const a = z.action;
  const action =
    a.kind === 'sell' && plan.sellMode === 'once'
      ? `賣出持有的 ${pctText(a.pct)}（如果這一輪還沒在這個價位賣過）`
      : actionText(a, plan, asset, now);
  const f = (v: number) => fmtPrice(v, asset);
  const act = (p: number) => actionText(zoneAt(plan, p).action, plan, asset);
  const eps = (v: number) => v * 1e-9;
  let down: { t: number; text: string } | null = null;
  let up: { t: number; text: string } | null = null;
  for (const r of plan.rules) {
    // 往下：跌破「漲到」的門檻、或碰到「跌到」的門檻，就換一階
    if (isAbove(plan, r) && r.price <= price && (!down || r.price > down.t)) down = { t: r.price, text: `跌破 ${f(r.price)}：${act(r.price - eps(r.price))}` };
    if (isBelow(plan, r) && r.price < price && (!down || r.price > down.t)) down = { t: r.price, text: `跌到 ${f(r.price)}：${act(r.price)}` };
    // 往上：碰到「漲到」的門檻、或漲破「跌到」的門檻，就換一階
    if (isAbove(plan, r) && r.price > price && (!up || r.price < up.t)) up = { t: r.price, text: `漲到 ${f(r.price)}：${act(r.price)}` };
    if (isBelow(plan, r) && r.price >= price && (!up || r.price < up.t)) up = { t: r.price, text: `漲破 ${f(r.price)}：${act(r.price + eps(r.price))}` };
  }
  return { zone: zoneText(z.ruleIndex, plan, asset), action, nextDown: down?.text ?? null, nextUp: up?.text ?? null };
}

const gain = (v: number, m: (x: number) => string) => (v >= 0 ? `賺 ${m(v)}` : `賠 ${m(-v)}`);

/** 回測結果的白話結論：和一般定投比較，以及賣出到底有沒有幫助 */
export function summarizeDca(dyn: DcaResult, plain: DcaResult, plan: DcaPlan, candles: readonly Candle[], asset: AssetConfig): string[] {
  const m = (v: number) => money(v, asset);
  const out: string[] = [];
  const from = fmtDate(candles[dyn.start]!.time);
  const to = fmtDate(candles[dyn.end]!.time);
  out.push(
    `${from}～${to}，${CADENCE_LABELS[plan.cadence]}看一次價格、照價格階梯操作，共 ${dyn.periods} 次：買進 ${dyn.buys} 次、總共投入 ${m(dyn.invested)}` +
      (dyn.sells > 0 ? `；賣出 ${dyn.sells} 次、拿回 ${m(dyn.cashOut)}。` : '，沒有賣出。'),
  );
  out.push(
    `期末還有 ${unitsText(dyn.units, asset)}（值 ${m(dyn.holdingValue)}）` +
      (dyn.cashOut > 0 ? `，加上拿回的現金共 ${m(dyn.totalValue)}` : '') +
      `，${gain(dyn.profit, m)}（${fmtPct(dyn.returnPct)}）。`,
  );
  out.push(
    `對照一般定投（${CADENCE_LABELS[plan.cadence]}固定買 ${m(plan.baseAmount)}、不賣）：投入 ${m(plain.invested)}，期末值 ${m(plain.totalValue)}，` +
      `${gain(plain.profit, m)}（${fmtPct(plain.returnPct)}）。`,
  );
  if (dyn.avgCost !== null && plain.avgCost !== null) {
    const d = dyn.avgCost / plain.avgCost - 1;
    out.push(
      `平均買進成本：動態定投 ${fmtPrice(dyn.avgCost, asset)}，一般定投 ${fmtPrice(plain.avgCost, asset)}` +
        (d < -0.005
          ? `，低了 ${pp(d)}%：跌的時候買得比較多，平均成本就比較低。`
          : d > 0.005
            ? `，反而高了 ${pp(d)}%（這段期間在價格偏高的時候買得比較多）。`
            : '，差不多。'),
    );
  }
  if (dyn.xirr !== null && plain.xirr !== null) {
    const d = dyn.xirr - plain.xirr;
    out.push(
      `把「什麼時候投入、投入多少」都算進去的年化報酬（XIRR）：動態定投 ${fmtPct(dyn.xirr)}，一般定投 ${fmtPct(plain.xirr)}` +
        (Math.abs(d) < 0.005 ? '，差不多。' : d > 0 ? `，動態定投比較好（多 ${pp(d)} 個百分點）。` : `，一般定投比較好（多 ${pp(d)} 個百分點）。`),
    );
  }
  if (dyn.sells > 0) {
    const keep = dyn.unitsSold * dyn.finalPrice;
    out.push(
      `賣出的 ${unitsText(dyn.unitsSold, asset)} 拿回 ${m(dyn.cashOut)}；如果沒賣、留到期末，值 ${m(keep)}` +
        (keep > dyn.cashOut * 1.005
          ? `：賣早了，少了 ${m(keep - dyn.cashOut)}。`
          : keep < dyn.cashOut * 0.995
            ? `：賣得好，多保住了 ${m(dyn.cashOut - keep)}。`
            : '，差不多。'),
    );
  }
  return out;
}

/** 提醒：階梯沒發揮作用、沒有賣出、事後諸葛 */
export function dcaNotes(dyn: DcaResult, plan: DcaPlan, asset: AssetConfig): string[] {
  const out: string[] = [];
  let top = -1;
  let topCount = 0;
  for (const [k, v] of dyn.zoneCounts) {
    if (v > topCount) {
      top = k;
      topCount = v;
    }
  }
  if (dyn.periods >= 4 && topCount / dyn.periods >= 0.9) {
    out.push(
      `這段期間有 ${fmtPct(topCount / dyn.periods, 0, false)} 的時候價格都在「${zoneText(top, plan, asset)}」這一階，價格階梯幾乎沒有發揮作用：可以換一段期間，或把階梯調整到這段期間的價格附近。`,
    );
  }
  if (plan.rules.some((r) => r.action.kind === 'sell' && isAbove(plan, r)) && dyn.sells === 0) {
    out.push('這段期間價格沒有漲到賣出的價位，所以沒有賣出。');
  }
  out.push('價格階梯是用「現在」的眼光設定的；拿來回測過去，等於事先知道價格會在哪個範圍，實際操作時很難設得這麼剛好。');
  return out;
}
