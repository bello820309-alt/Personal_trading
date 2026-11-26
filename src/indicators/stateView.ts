import type { StateNote, StateSummary } from './types';

/**
 * 卡片怎麼排：有白話（plain）時，第一行只放白話，原本的數字標題和結論放進展開區的第一點；
 * 沒有白話的指標照舊（標題＋結論）。
 */
export function stateView(d: StateSummary): { first: string; detail: string; notes: StateNote[] | undefined } {
  if (!d.plain) return { first: d.headline, detail: d.detail, notes: d.notes };
  return { first: d.plain, detail: '', notes: [{ title: '數字和說明', text: `${d.headline}。${d.detail}` }, ...(d.notes ?? [])] };
}
