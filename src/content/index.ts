import { CRYPTO_CONTENT } from './indicators/crypto';
import { MOMENTUM_CONTENT } from './indicators/momentum';
import { OTHER_CONTENT } from './indicators/others';
import { TREND_CONTENT } from './indicators/trend';
import type { IndicatorContent } from './types';

export { BASICS, getBasics } from './basics';
export { GLOSSARY } from './glossary';

/*
 * 指標解說。新增指標時，在 indicators/ 底下對應分類的檔案加一筆，
 * 或新增一個檔案再加進下面的清單。
 */
const ALL: IndicatorContent[] = [...TREND_CONTENT, ...MOMENTUM_CONTENT, ...OTHER_CONTENT, ...CRYPTO_CONTENT];
const BY_ID = new Map(ALL.map((c) => [c.id, c]));

export function getContent(id: string | null | undefined): IndicatorContent | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/**
 * 某條線的白話說明（把 {label}、{n} 換成線的名稱與天數）。
 * barUnit：週 K、月 K 時傳「週」「個月」，會把「{n} 天」換成「{n} 週」。
 */
export function lineGuideText(
  content: IndicatorContent | undefined,
  line: { key: string; label: string },
  barUnit?: string,
): string | null {
  if (!content) return null;
  const raw = content.lineGuide[line.key] ?? content.lineGuide['*'];
  if (!raw) return null;
  const n = line.label.match(/\d+/)?.[0] ?? '';
  let text = raw.replaceAll('{label}', line.label);
  if (barUnit) text = text.replace(/\{n\} ?[天日]/g, `${n} ${barUnit}`);
  return text.replaceAll('{n}', n);
}

export const ALL_CONTENT = ALL;
