import { describe, expect, it } from 'vitest';
import { INDICATORS, computeIndicator } from '../indicators/registry';
import { syntheticCandles } from '../indicators/testUtils';
import { ALL_CONTENT, BASICS, GLOSSARY, getContent, lineGuideText } from './index';

describe('解說內容', () => {
  it('每個指標都有完整的解說', () => {
    for (const def of INDICATORS) {
      const c = getContent(def.id);
      expect(c, `${def.id} 缺少解說`).toBeDefined();
      expect(c!.oneLiner.length).toBeGreaterThan(10);
      expect(c!.principle.length).toBeGreaterThan(0);
      expect(c!.steps.length).toBeGreaterThan(0);
      expect(c!.howToRead.length).toBeGreaterThan(0);
      expect(c!.uses.length).toBeGreaterThan(0);
      expect(c!.pitfalls.length).toBeGreaterThan(0);
    }
  });

  it('解說沒有多餘或重複的 id', () => {
    const ids = ALL_CONTENT.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(INDICATORS.some((d) => d.id === id), `${id} 沒有對應的指標`).toBe(true);
  });

  it('圖上畫出的每一條線都有白話說明（新增指標時不會漏寫）', () => {
    const candles = syntheticCandles(400);
    for (const def of INDICATORS) {
      const c = getContent(def.id)!;
      const seenKeys = new Set<string>();
      for (const market of ['tw', 'us', 'crypto'] as const) {
        const visible = computeIndicator(def, candles, market).result.lines.filter((l) => !l.hidden);
        for (const l of visible) {
          seenKeys.add(l.key);
          const text = lineGuideText(c, l);
          expect(text, `${def.id} 的 ${l.key}（${l.label}）缺少說明`).toBeTruthy();
          expect(text, `${def.id} 的 ${l.key} 有沒代換的 {}`).not.toMatch(/[{}]/);
        }
        if (visible.length === 0) expect(c.chartNote, `${def.id} 圖上沒有線，需要 chartNote 說明`).toBeTruthy();
      }
      // 說明的 key 都要對應到實際存在的線（避免改了指標卻忘了改說明）
      for (const key of Object.keys(c.lineGuide)) {
        if (key !== '*') expect(seenKeys.has(key), `${def.id} 的說明 ${key} 沒有對應的線`).toBe(true);
      }
    }
  });

  it('週 K、月 K 時，說明裡的「N 天」會換成「N 週」「N 個月」', () => {
    expect(lineGuideText(getContent('sma'), { key: 'MA20', label: 'MA20' }, '週')).toContain('最近 20 週收盤價的平均');
    expect(lineGuideText(getContent('bias'), { key: 'bias', label: 'BIAS(20)' }, '個月')).toContain('離 20 個月均線');
    expect(lineGuideText(getContent('sma'), { key: 'MA20', label: 'MA20' })).toContain('最近 20 天');
  });

  it('名詞辭典的連結都指向存在的頁面', () => {
    for (const t of GLOSSARY) {
      for (const r of t.related ?? []) {
        if (r.type === 'indicator') expect(getContent(r.id), `${t.term} → ${r.id}`).toBeDefined();
        else expect(BASICS.some((b) => b.id === r.id), `${t.term} → ${r.id}`).toBe(true);
      }
    }
  });
});
