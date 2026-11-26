import { describe, expect, it } from 'vitest';
import { GLOSSARY } from './glossary';
import { GLOSSARY_LINKS, splitTerms } from './terms';

describe('術語連到名詞小辭典', () => {
  it('每個術語的搜尋字都找得到小辭典裡的一條', () => {
    for (const [, term] of GLOSSARY_LINKS) {
      expect(
        GLOSSARY.some((g) => g.term.includes(term)),
        term,
      ).toBe(true);
    }
  });

  it('同一個術語只連第一次，長的先比對', () => {
    const parts = splitTerms('DIF 在訊號線之下，DIF 和死亡交叉');
    expect(parts.filter((p) => p.term).map((p) => p.text)).toEqual(['DIF', '死亡交叉']);
    expect(parts.map((p) => p.text).join('')).toBe('DIF 在訊號線之下，DIF 和死亡交叉');
  });

  it('最多連 4 個', () => {
    const parts = splitTerms('鈍化、背離、乖離、超買、支撐、標準差');
    expect(parts.filter((p) => p.term)).toHaveLength(4);
  });
});
