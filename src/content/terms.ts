/**
 * 說明文字裡要變成連結的術語 → 名詞小辭典的搜尋字。
 * 搜尋字要能在小辭典裡找到那一條（有測試檢查）。
 */
export const GLOSSARY_LINKS: [word: string, term: string][] = [
  ['柱狀體', 'DIF'],
  ['訊號線', 'DIF'],
  ['DIF', 'DIF'],
  ['%B', '%B'],
  ['+DI', '+DI'],
  ['−DI', '+DI'],
  ['ADX', '+DI'],
  ['先行帶', '先行帶'],
  ['雲層', '先行帶'],
  ['樞軸', '樞軸點'],
  ['RSV', 'RSV'],
  ['黃金交叉', '黃金交叉'],
  ['死亡交叉', '死亡交叉'],
  ['鈍化', '鈍化'],
  ['背離', '背離'],
  ['乖離', '乖離'],
  ['超買', '超買'],
  ['超賣', '超買'],
  ['支撐', '支撐'],
  ['壓力', '支撐'],
  ['標準差', '標準差'],
  ['最大回撤', '最大回撤'],
  ['假突破', '假突破'],
  ['跳空', '跳空'],
  ['缺口', '跳空'],
  ['多頭排列', '多頭排列'],
  ['月線', '月線'],
  ['季線', '月線'],
];

/** 把一段文字切成「一般文字」和「要連到小辭典的術語」；每個術語只連第一次，最多連 max 個。 */
export function splitTerms(text: string, max = 4): { text: string; term?: string }[] {
  // 先找出每個術語第一次出現的位置，照出現順序挑；同位置時長的優先（「死亡交叉」優先於短的）
  const found = GLOSSARY_LINKS.flatMap(([word, term]) => {
    const at = text.indexOf(word);
    return at < 0 ? [] : [{ start: at, end: at + word.length, term }];
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  const hits: typeof found = [];
  const used = new Set<string>();
  for (const f of found) {
    if (hits.length >= max) break;
    if (used.has(f.term) || hits.some((h) => f.start < h.end && f.end > h.start)) continue;
    hits.push(f);
    used.add(f.term);
  }
  const out: { text: string; term?: string }[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) out.push({ text: text.slice(pos, h.start) });
    out.push({ text: text.slice(h.start, h.end), term: h.term });
    pos = h.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
