import type { StateNote } from '../indicators/types';
import { ChevronRightIcon } from './icons';

/**
 * 指標狀態的補充說明：預設收起來，先看到有哪幾點（短標題），點開才看內容。
 * 用原生的 <details>，「AI 實驗」參加者用的讀網頁工具會自動展開。
 */
export function StateNotes({ notes, className = '' }: { notes?: StateNote[]; className?: string }) {
  if (!notes?.length) return null;
  return (
    <details className={`group ${className}`}>
      <summary className="flex cursor-pointer list-none items-start gap-1 text-xs leading-relaxed text-accent [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
        <span>
          還有 {notes.length} 點說明：{notes.map((n) => n.title).join('、')}
        </span>
      </summary>
      <ul className="mt-1.5 space-y-1.5 border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
        {notes.map((n) => (
          <li key={n.title}>
            <span className="font-medium text-fg">{n.title}：</span>
            {n.text}
          </li>
        ))}
      </ul>
    </details>
  );
}
