import { useMemo, useState } from 'react';
import { getContent } from '../content';
import { indicatorsByCategory } from '../indicators/registry';
import { CATEGORY_INTRO, CATEGORY_LABELS } from '../indicators/types';
import { Link } from '../router';
import { Sheet } from './ui';

export function IndicatorPicker({
  open,
  onClose,
  activeIds,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  activeIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    return indicatorsByCategory()
      .map((g) => ({
        ...g,
        items: g.items.filter((d) => {
          if (!query) return true;
          const c = getContent(d.id);
          return [d.name, d.shortName, d.enName, c?.oneLiner ?? ''].some((s) => s.toLowerCase().includes(query));
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <Sheet open={open} onClose={onClose} title="加入指標">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜尋，例如 RSI、均線、KD"
        className="mb-4 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.category}>
            <h3 className="text-sm font-semibold text-fg">{CATEGORY_LABELS[g.category]}</h3>
            <p className="mb-2 text-xs text-muted">{CATEGORY_INTRO[g.category]}</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {g.items.map((d) => {
                const active = activeIds.includes(d.id);
                return (
                  <li key={d.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fg">
                        {d.name}
                        <span className="ml-1.5 text-xs font-normal text-muted">{d.shortName !== d.name ? d.shortName : ''}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{getContent(d.id)?.oneLiner}</p>
                      <Link to={`/learn/${d.id}`} className="mt-1 inline-block text-xs text-accent" onClick={onClose}>
                        看完整解說
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => (active ? onRemove(d.id) : onAdd(d.id))}
                      className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
                        active ? 'border border-line text-muted' : 'bg-accent text-accent-contrast'
                      }`}
                    >
                      {active ? '移除' : '加入'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
