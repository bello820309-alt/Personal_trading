import { describe, expect, it } from 'vitest';
import { INDICATORS } from '../indicators/registry';
import { ALL_CONTENT, BASICS, GLOSSARY, getContent } from './index';

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

  it('名詞辭典的連結都指向存在的頁面', () => {
    for (const t of GLOSSARY) {
      for (const r of t.related ?? []) {
        if (r.type === 'indicator') expect(getContent(r.id), `${t.term} → ${r.id}`).toBeDefined();
        else expect(BASICS.some((b) => b.id === r.id), `${t.term} → ${r.id}`).toBe(true);
      }
    }
  });
});
