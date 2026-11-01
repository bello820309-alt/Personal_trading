import { getContent } from '../content';
import { getIndicator } from '../indicators/registry';
import { CATEGORY_LABELS } from '../indicators/types';
import { Link } from '../router';
import { Sheet } from './ui';

/** 圖表頁點 ⓘ 時跳出的精簡解說 */
export function ExplainSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const def = getIndicator(id);
  const c = getContent(id);
  return (
    <Sheet open={!!def} onClose={onClose} title={def ? `${def.name}（${def.shortName}）` : ''}>
      {def && (
        <div className="space-y-4 text-sm leading-relaxed text-fg">
          <p className="text-xs text-muted">
            {CATEGORY_LABELS[def.category]} · {def.enName}
          </p>
          {c ? (
            <>
              <p className="text-base font-medium">{c.oneLiner}</p>
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-muted">
                <span className="font-medium text-fg">打個比方：</span>
                {c.analogy}
              </p>
              <div>
                <h3 className="mb-1 font-semibold">原理</h3>
                <p>{c.principle[0]}</p>
              </div>
              <div>
                <h3 className="mb-1 font-semibold">怎麼看</h3>
                <ul className="space-y-1.5">
                  {c.howToRead.map((h) => (
                    <li key={h.title}>
                      <span className="font-medium">{h.title}：</span>
                      {h.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1 font-semibold">要小心</h3>
                <ul className="list-disc space-y-1 pl-5">
                  {c.pitfalls.slice(0, 2).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-muted">這個指標的解說還在撰寫中。</p>
          )}
          <Link
            to={`/learn/${def.id}`}
            onClick={onClose}
            className="block rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-accent-contrast"
          >
            看完整解說（計算方式、用途、回測）
          </Link>
        </div>
      )}
    </Sheet>
  );
}
