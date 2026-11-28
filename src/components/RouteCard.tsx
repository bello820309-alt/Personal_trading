import { useEffect, useState } from 'react';
import { nextRouteDay, parseRouteProgress, ROUTE_DAYS, ROUTE_STORAGE_KEY } from '../content/route';
import { Link } from '../router';
import { ChevronRightIcon } from './icons';

function readProgress(): number[] {
  try {
    return parseRouteProgress(localStorage.getItem(ROUTE_STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveProgress(done: number[]) {
  try {
    localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(done));
  } catch {
    // 私密瀏覽或關掉儲存時存不了，畫面照常可以勾，只是重新整理後會消失
  }
}

/**
 * 7 天新手路線：可以勾選完成，進度存在這台裝置的瀏覽器裡。
 * compact：總覽頂端用，只展開下一個還沒完成的那天；完整版（第一次使用那篇）每天都展開。
 */
export function RouteCard({ compact = false }: { compact?: boolean }) {
  const [done, setDone] = useState<number[]>([]);
  const [showAll, setShowAll] = useState(!compact);
  useEffect(() => setDone(readProgress()), []);
  const toggle = (day: number) => {
    const next = done.includes(day) ? done.filter((d) => d !== day) : [...done, day].sort((a, b) => a - b);
    setDone(next);
    saveProgress(next);
  };
  const nextDay = nextRouteDay(done);
  const days = showAll ? ROUTE_DAYS : ROUTE_DAYS.filter((d) => d.day === nextDay);
  // 總覽頂端：預設收成一行，手機第一個畫面才看得到三檔的價格
  if (compact && !showAll) {
    const next = ROUTE_DAYS.find((d) => d.day === nextDay);
    return (
      <section className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3" aria-label="7 天新手路線">
        <button
          type="button"
          onClick={() => setShowAll(true)}
          aria-expanded={false}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
        >
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-accent" />
          <span className="shrink-0 font-semibold text-fg">7 天新手路線</span>
          <span className="shrink-0 text-muted tabular">
            {done.length}／{ROUTE_DAYS.length}
          </span>
          <span className="min-w-0 truncate text-muted">{next ? `・下一步：第 ${next.day} 天 ${next.title}` : '・全部完成了！'}</span>
        </button>
        {next && (
          <Link to={next.links[0]!.to} className="inline-flex min-h-10 shrink-0 items-center text-sm text-accent">
            開始 →
          </Link>
        )}
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3" aria-label="7 天新手路線">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-fg">7 天新手路線</h2>
        <span className="text-sm text-muted">
          已完成 {done.length}／{ROUTE_DAYS.length}
          {nextDay === null && '，全部完成了！'}
        </span>
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        每天一個小任務，做完就打勾（進度存在這台裝置的瀏覽器裡）。完整說明在
        <Link to="/basics/getting-started" className="mx-1 text-accent">
          第一次使用：從哪裡開始？
        </Link>
      </p>
      <ol className="mt-2 space-y-2">
        {days.map((d) => {
          const checked = done.includes(d.day);
          return (
            <li key={d.day} className="rounded-lg bg-surface px-3 py-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={checked} onChange={() => toggle(d.day)} className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
                <span className={`text-sm font-medium ${checked ? 'text-muted line-through' : 'text-fg'}`}>
                  第 {d.day} 天：{d.title}
                </span>
              </label>
              <p className="mt-1 text-sm leading-relaxed text-muted">{d.task}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {d.links.map((l) => (
                  <Link key={l.to} to={l.to} className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm text-accent">
                    {l.label} →
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      {compact && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm text-accent"
          aria-expanded={showAll}
        >
          <ChevronRightIcon className={`h-4 w-4 transition-transform ${showAll ? 'rotate-90' : ''}`} />
          收起
        </button>
      )}
    </section>
  );
}
