import { BASICS, getBasics } from '../content';
import { Link } from '../router';
import { NotFound } from './NotFound';

export function BasicsPage({ id }: { id: string }) {
  const a = getBasics(id);
  if (!a) return <NotFound />;
  const idx = BASICS.findIndex((x) => x.id === a.id);
  const next = BASICS[idx + 1];
  return (
    <article className="mx-auto max-w-3xl space-y-5">
      <nav className="text-sm text-muted">
        <Link to="/learn" className="text-accent">
          指標百科
        </Link>
        <span className="mx-1.5">/</span>基礎觀念
      </nav>
      <header>
        <h1 className="text-2xl font-bold text-fg">{a.title}</h1>
        <p className="mt-1 text-muted">{a.summary}</p>
      </header>
      {a.sections.map((s, i) => (
        <section key={s.heading ?? i} className="space-y-2 leading-relaxed text-fg">
          {s.heading && <h2 className="text-lg font-semibold">{s.heading}</h2>}
          {s.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s.bullets && (
            <ul className="list-disc space-y-1.5 pl-5">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4 text-sm">
        <Link to="/learn" className="text-accent">
          ← 回指標百科
        </Link>
        {next && (
          <Link to={`/basics/${next.id}`} className="text-accent">
            下一篇：{next.title} →
          </Link>
        )}
      </div>
      <nav aria-label="全部的基礎觀念" className="rounded-lg border border-line px-3 py-2.5 text-sm">
        <div className="mb-1 text-xs text-muted">全部的基礎觀念</div>
        <ul className="space-y-1">
          {BASICS.map((b) => (
            <li key={b.id}>
              {b.id === a.id ? (
                <span className="font-medium text-fg">{b.title}（這一篇）</span>
              ) : (
                <Link to={`/basics/${b.id}`} className="text-accent">
                  {b.title}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
