import { describe, expect, it } from 'vitest';
import { getAsset } from '../config/assets';
import type { Candle } from '../data/types';
import { defaultPlan, plainPlan, runDca, type DcaPlan } from './dca';
import { dcaNotes, money, nowAdvice, summarizeDca, unitsText } from './dcaSummary';

const btc = getAsset('BTC')!;
const plan = defaultPlan('BTC', 80000);
const DAY = 86400000;

function candles(start: string, closes: number[]): Candle[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ time: new Date(t0 + i * DAY).toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: 1 }));
}

describe('nowAdvice：這一期該做什麼', () => {
  it('在基準區間：照基本金額買，並告訴你再跌、再漲到哪裡會換一階', () => {
    const a = nowAdvice(plan, 78248, btc);
    expect(a.zone).toBe('70,000～90,000 之間');
    expect(a.action).toBe('這週買 US$100');
    expect(a.nextDown).toBe('跌到 70,000：每週買 US$120');
    expect(a.nextUp).toBe('漲到 90,000：每週買 US$50');
  });

  it('跌到 7 萬以下：買 120；漲破 7 萬回到基本金額', () => {
    const a = nowAdvice(plan, 65000, btc);
    expect(a.action).toBe('這週買 US$120');
    expect(a.nextDown).toBe('跌到 60,000：每週買 US$150');
    expect(a.nextUp).toBe('漲破 70,000：每週買 US$100');
  });

  it('11 萬以上：賣出持有的 10%', () => {
    const a = nowAdvice(plan, 115000, btc);
    expect(a.action).toBe('這週賣出持有的 10%');
    expect(a.nextUp).toBe('漲到 120,000：每週賣出持有的 20%');
    expect(a.nextDown).toBe('跌破 110,000：每週買 US$30');
  });

  it('只賣一次的模式，說明要看這一輪有沒有賣過', () => {
    const once: DcaPlan = { ...plan, sellMode: 'once' };
    expect(nowAdvice(once, 115000, btc).action).toContain('還沒在這個價位賣過');
  });
});

describe('summarizeDca', () => {
  it('賣在高點、之後價格回落：說明「賣得好」，並和一般定投比較', () => {
    const c = candles('2026-01-05', [...new Array(14).fill(80000), ...new Array(21).fill(115000), ...new Array(7).fill(90000)]);
    const dyn = runDca(c, 0, c.length - 1, plan, { feeRate: 0, sellTaxRate: 0 });
    const plain = runDca(c, 0, c.length - 1, plainPlan(plan), { feeRate: 0, sellTaxRate: 0 });
    const lines = summarizeDca(dyn, plain, plan, c, btc).join('\n');
    expect(lines).toContain('賣出 3 次');
    expect(lines).toContain('賣得好');
    expect(lines).toContain('一般定投');
  });

  it('價格一直在同一階時提醒階梯沒有發揮作用', () => {
    const c = candles('2026-01-05', new Array(60).fill(78000));
    const dyn = runDca(c, 0, c.length - 1, plan, { feeRate: 0, sellTaxRate: 0 });
    const notes = dcaNotes(dyn, plan, btc);
    expect(notes[0]).toContain('幾乎沒有發揮作用');
    expect(notes.some((n) => n.includes('沒有漲到賣出的價位'))).toBe(true);
  });
});

describe('格式', () => {
  it('金額與數量', () => {
    expect(money(120, btc)).toBe('US$120');
    expect(money(45.6, btc)).toBe('US$45.60');
    expect(money(-1234.5, btc)).toBe('-US$1,235');
    expect(unitsText(0.0123456, btc)).toBe('0.012346 BTC');
  });
});
