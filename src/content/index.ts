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
const ALL: IndicatorContent[] = [...TREND_CONTENT, ...MOMENTUM_CONTENT, ...OTHER_CONTENT];
const BY_ID = new Map(ALL.map((c) => [c.id, c]));

export function getContent(id: string | null | undefined): IndicatorContent | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export const ALL_CONTENT = ALL;
