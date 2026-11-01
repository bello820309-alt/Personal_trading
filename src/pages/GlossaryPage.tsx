import { useState } from 'react';
import { PageTitle } from '../components/ui';
import { GLOSSARY, getBasics, getContent } from '../content';
import { getIndicator } from '../indicators/registry';
import { Link } from '../router';

export function GlossaryPage() {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const items = GLOSSARY.filter((t) => !query || [t.term, t.en ?? '', t.text].some((s) => s.toLowerCase().includes(query)));
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle sub="看不懂的名詞，在這裡查。">名詞小辭典</PageTitle>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜尋，例如 背離、回撤、黃金交叉"
        className="mb-4 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
        {items.map((t) => (
          <div key={t.term} className="px-4 py-3">
            <dt className="font-semibold text-fg">
              {t.term}
              {t.en && <span className="ml-2 text-sm font-normal text-muted">{t.en}</span>}
            </dt>
            <dd className="mt-1 text-sm leading-relaxed text-fg">{t.text}</dd>
            {t.related && (
              <dd className="mt-1 flex flex-wrap gap-x-3 text-xs">
                {t.related.map((r) =>
                  r.type === 'indicator' ? (
                    <Link key={r.id} to={`/learn/${r.id}`} className="text-accent">
                      {getIndicator(r.id)?.name ?? getContent(r.id)?.id}
                    </Link>
                  ) : (
                    <Link key={r.id} to={`/basics/${r.id}`} className="text-accent">
                      {getBasics(r.id)?.title}
                    </Link>
                  ),
                )}
              </dd>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="px-4 py-6 text-sm text-muted">找不到「{q}」。</p>}
      </dl>
    </div>
  );
}
