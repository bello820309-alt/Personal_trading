import { ChevronRightIcon } from '../components/icons';
import { Card, PageTitle } from '../components/ui';
import { BASICS, getContent } from '../content';
import { indicatorsByCategory } from '../indicators/registry';
import { CATEGORY_INTRO, CATEGORY_LABELS } from '../indicators/types';
import { Link } from '../router';

export function LearnIndex() {
  return (
    <div className="space-y-6">
      <PageTitle sub="每個指標都有白話原理、怎麼看、用途和常見誤區，還能直接在真實資料上看效果、做回測。">指標百科</PageTitle>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-fg">新手先讀這幾篇</h2>
        <p className="mb-3 text-sm text-muted">技術分析的基礎觀念，每篇大約 3 分鐘。</p>
        <ul className="grid gap-2 md:grid-cols-2">
          {BASICS.map((a) => (
            <li key={a.id}>
              <Link
                to={`/basics/${a.id}`}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{a.title}</span>
                  <span className="block text-xs text-muted">{a.summary}</span>
                </span>
                <ChevronRightIcon className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/glossary" className="mt-3 inline-block text-sm text-accent">
          名詞小辭典：黃金交叉、超買、背離、最大回撤…是什麼意思？ →
        </Link>
      </Card>

      {indicatorsByCategory().map((g) => (
        <section key={g.category}>
          <h2 className="text-lg font-semibold text-fg">{CATEGORY_LABELS[g.category]}指標</h2>
          <p className="mb-3 text-sm text-muted">{CATEGORY_INTRO[g.category]}</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((d) => {
              const c = getContent(d.id);
              return (
                <li key={d.id}>
                  <Link
                    to={`/learn/${d.id}`}
                    className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent"
                  >
                    <span className="text-base font-semibold text-fg">
                      {d.name}
                      {d.shortName !== d.name && <span className="ml-1.5 text-sm font-normal text-muted">{d.shortName}</span>}
                    </span>
                    <span className="mt-1 flex-1 text-sm leading-relaxed text-muted">{c?.oneLiner}</span>
                    <span className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      {c && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">{c.kind.timing}</span>}
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                        {d.strategy ? '可回測' : '參考價位／不產生訊號'}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
