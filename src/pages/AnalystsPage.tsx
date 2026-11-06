import { useMemo, type ReactNode } from 'react';
import { evaluateNotes, STATUS_LABELS, trackRecord, type CallStatus, type EvaluatedCall, type TrackRecord } from '../analysts/evaluate';
import { ASSET_NAMES, dayText, progressText, ruleText, STANCE_LABELS } from '../analysts/format';
import { useAnalysts, type AnalystData, type AnalystEntry } from '../analysts/load';
import type { AnalystNote, AnalystVideo, AnalystView, Stance } from '../analysts/types';
import { Card, Fold, Notice, PageTitle, Spinner } from '../components/ui';
import { fmtPct } from '../data/format';
import { localTime, TAIPEI, taipeiDate } from '../lab/time';
import { Link } from '../router';

const STATUS_CLASS: Record<CallStatus, string> = {
  pending: 'bg-surface-2 text-muted',
  hit: 'bg-accent/15 text-accent',
  miss: 'bg-hot/15 text-hot',
  void: 'bg-surface-2 text-muted',
};

const STANCE_CLASS: Record<Stance, string> = {
  bullish: 'bg-up/15 text-up',
  bearish: 'bg-down/15 text-down',
  neutral: 'bg-surface-2 text-muted',
  mixed: 'bg-hot/15 text-hot',
};

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** ISO 時間 → 台灣時間的「11/6（五）23:05」 */
function taipeiText(iso: string, year: number): string {
  const t = localTime(Date.parse(iso), TAIPEI);
  return `${dayText(t.date, year)} ${t.hm}`;
}

const noteDay = (n: AnalystNote, year: number) => dayText(taipeiDate(Date.parse(n.published)), year);

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
      {children} ↗
    </a>
  );
}

export function AnalystsPage() {
  const state = useAnalysts();
  return (
    <div>
      <PageTitle sub="記錄分析師在影片裡說了什麼，之後用實際的價格對照，看他說得準不準。">分析師追蹤</PageTitle>
      {state.status === 'loading' && <Spinner />}
      {state.status === 'missing' && <Notice>{state.message}</Notice>}
      {state.status === 'error' && <Notice tone="warn">讀取資料失敗：{state.message}</Notice>}
      {state.status === 'ready' && <Content data={state.data} />}
    </div>
  );
}

function Content({ data }: { data: AnalystData }) {
  const today = taipeiDate(Date.now());
  const year = Number(today.slice(0, 4));
  return (
    <div className="space-y-8">
      <Notice>
        這裡是分析師個人的看法，不是本站的建議，也不代表一定會發生。影片重點是 AI 從逐字稿整理成中文的，可能有漏掉或理解錯的地方，以原影片為準。
      </Notice>
      {data.analysts.map((a) => (
        <AnalystSection key={a.profile.id} entry={a} data={data} today={today} year={year} />
      ))}
      <div className="space-y-3">
        <Fold title="怎麼判斷說對還是說錯？" sub="從影片上傳的隔天開始，用每天的最高價、最低價對照">
          <Rules />
        </Fold>
        <Fold title="怎麼新增影片的重點、或追蹤新的分析師？" sub="把逐字稿貼給 Claude；新的分析師給頻道網址就好">
          <HowToAdd />
        </Fold>
      </div>
    </div>
  );
}

function latestViews(notes: AnalystNote[]): { view: AnalystView; note: AnalystNote }[] {
  const seen = new Set<string>();
  const out: { view: AnalystView; note: AnalystNote }[] = [];
  for (const note of notes) {
    for (const view of note.views) {
      if (seen.has(view.topic)) continue;
      seen.add(view.topic);
      out.push({ view, note });
    }
  }
  return out;
}

function SubTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-2">
      <h3 className="text-base font-semibold text-fg">{children}</h3>
      {sub && <p className="mt-0.5 text-xs leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

function AnalystSection({ entry, data, today, year }: { entry: AnalystEntry; data: AnalystData; today: string; year: number }) {
  const { profile, notes } = entry;
  const calls = useMemo(() => evaluateNotes(notes, data.candles, today), [notes, data.candles, today]);
  const done = new Set(notes.map((n) => n.videoId));
  const waiting = (entry.videos?.videos ?? []).filter((v) => !v.short && !done.has(v.id));
  const views = latestViews(notes);
  return (
    <section className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold text-fg">{profile.name}</h2>
          <span className="text-sm">
            <ExternalLink href={profile.channelUrl}>YouTube 頻道</ExternalLink>
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-fg">{profile.intro}</p>
        <p className="mt-2 text-xs text-muted">
          {dayText(profile.since, year)}開始追蹤 · 整理了 {notes.length} 支影片 · 記下 {calls.length} 個預測
        </p>
        <Record rec={trackRecord(calls)} />
      </Card>

      {views.length > 0 && (
        <div>
          <SubTitle sub="每個主題取最新一支影片的說法">他最近的看法</SubTitle>
          <div className="grid gap-3 md:grid-cols-3">
            {views.map(({ view, note }) => (
              <Card key={view.topic} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-fg">{view.topic}</span>
                  <Chip className={STANCE_CLASS[view.stance]}>{STANCE_LABELS[view.stance]}</Chip>
                </div>
                <p className="mt-2 leading-relaxed text-fg">{view.text}</p>
                <p className="mt-2 text-xs text-muted">出自 {noteDay(note, year)}的影片</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {calls.length > 0 && (
        <div>
          <SubTitle sub="只記下有具體價位或事件、可以事後對照的說法；狀態每天跟著收盤資料自動更新">他說過的預測</SubTitle>
          <div className="space-y-3">
            {calls.map((c) => (
              <CallCard key={c.call.id} ec={c} year={year} />
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div>
          <SubTitle>整理過的影片</SubTitle>
          <div className="space-y-3">
            {notes.map((n, i) => (
              <Fold key={n.videoId} title={`${noteDay(n, year)}「${n.titleZh}」`} sub={n.title} defaultOpen={i === 0}>
                <NoteBody note={n} year={year} />
              </Fold>
            ))}
          </div>
        </div>
      )}

      {entry.videos && <WaitingVideos videos={waiting} fetchedAt={entry.videos.fetchedAt} year={year} />}
    </section>
  );
}

function Record({ rec }: { rec: TrackRecord }) {
  const decided = rec.hit + rec.miss;
  return (
    <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-accent">說對 {rec.hit}</span>
        <span className="text-hot">說錯 {rec.miss}</span>
        <span className="text-muted">條件沒發生 {rec.void}</span>
        <span className="text-muted">等待結果 {rec.pending}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {decided === 0
          ? '還沒有預測到期。'
          : `有結果的 ${decided} 個預測裡，說對 ${rec.hit} 個（${fmtPct(rec.hit / decided, 0, false)}）。`}
        準不準要累積很多次才看得出來，只有幾個預測時，說對或說錯都可能只是運氣。
      </p>
    </div>
  );
}

function CallCard({ ec, year }: { ec: EvaluatedCall; year: number }) {
  const { call, note, result } = ec;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Chip className={STATUS_CLASS[result.status]}>{STATUS_LABELS[result.status]}</Chip>
        <span className="text-xs text-muted">
          {call.kind === 'price' ? ASSET_NAMES[call.asset] : '經濟事件'} · 期限 {dayText(call.by, year)}
        </span>
      </div>
      <p className="mt-2 font-medium leading-relaxed text-fg">{call.text}</p>
      {call.quote && <p className="mt-1 text-sm italic text-muted">“{call.quote}”</p>}
      <p className="mt-2 text-sm leading-relaxed text-fg">{progressText(call, result, year)}</p>
      <dl className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
        <div>
          <dt className="inline font-medium">怎麼算對：</dt>
          <dd className="inline">{call.kind === 'price' ? ruleText(call) : '到期後照實際發生的事標記。'}</dd>
        </div>
        <div>
          <dt className="inline font-medium">怎麼定的：</dt>
          <dd className="inline">{call.basis}</dd>
        </div>
        <div>
          <dt className="inline font-medium">出處：</dt>
          <dd className="inline">
            {noteDay(note, year)}的影片「{note.titleZh}」
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function NoteBody({ note, year }: { note: AnalystNote; year: number }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p className="font-medium text-fg">{note.summary}</p>
      <div className="flex flex-wrap gap-2">
        {note.views.map((v) => (
          <span key={v.topic} className="inline-flex items-center gap-1.5 text-xs text-muted">
            {v.topic}
            <Chip className={STANCE_CLASS[v.stance]}>{STANCE_LABELS[v.stance]}</Chip>
          </span>
        ))}
      </div>
      <div>
        <h4 className="font-medium text-fg">重點</h4>
        <ol className="mt-1.5 list-decimal space-y-2 pl-5 text-fg">
          {note.points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </div>
      {note.caveats && note.caveats.length > 0 && (
        <div>
          <h4 className="font-medium text-fg">他也提醒</h4>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-fg">
            {note.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {note.tools && note.tools.length > 0 && (
        <div>
          <h4 className="font-medium text-fg">影片裡用到的工具，在本站哪裡學</h4>
          <ul className="mt-1.5 space-y-1">
            {note.tools.map((t) => (
              <li key={t.to}>
                <Link to={t.to} className="text-accent hover:underline">
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted">
        <ExternalLink href={ytUrl(note.videoId)}>看原影片</ExternalLink> · 上傳時間 {taipeiText(note.published, year)}（台灣時間）· 整理於{' '}
        {taipeiText(note.addedAt, year)}
      </p>
    </div>
  );
}

function VideoRow({ v, year }: { v: AnalystVideo; year: number }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-fg">{v.title}</p>
        <p className="mt-0.5 text-xs text-muted">{taipeiText(v.published, year)}</p>
      </div>
      <span className="shrink-0 text-sm">
        <ExternalLink href={ytUrl(v.id)}>看影片</ExternalLink>
      </span>
    </li>
  );
}

function WaitingVideos({ videos, fetchedAt, year }: { videos: AnalystVideo[]; fetchedAt: string; year: number }) {
  const shown = videos.slice(0, 5);
  const rest = videos.slice(5);
  return (
    <div>
      <SubTitle
        sub={`頻道的影片清單每天自動檢查兩次以上（最近一次更新：${taipeiText(fetchedAt, year)}）。想看哪一支的重點，照最下面「怎麼新增」的方法把逐字稿貼給 Claude。`}
      >
        還沒整理的影片（{videos.length} 支）
      </SubTitle>
      {videos.length === 0 ? (
        <p className="text-sm text-muted">最近的影片都整理好了。</p>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {shown.map((v) => (
              <VideoRow key={v.id} v={v} year={year} />
            ))}
          </ul>
          {rest.length > 0 && (
            <Fold title={`更早的 ${rest.length} 支`}>
              <ul className="-mx-4 -my-3 divide-y divide-line">
                {rest.map((v) => (
                  <VideoRow key={v.id} v={v} year={year} />
                ))}
              </ul>
            </Fold>
          )}
        </div>
      )}
    </div>
  );
}

function Rules() {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-fg">
      <li>只記下說得出具體價位、或可以事後確認的預測。他沒說期限的，照他的說法訂一個合理的期限，寫在每個預測的「怎麼定的」裡。</li>
      <li>
        價格預測用本站每天的收盤資料（比特幣是台灣早上 8 點收的日 K），從影片上傳的隔天開始算：上傳當天的 K 棒有一部分是上傳之前的價格，所以不算。
      </li>
      <li>期限內任何一天的最低價（看跌時）或最高價（看漲時）碰到目標價，就算說對；資料到了期限那天還沒碰到，就算說錯。</li>
      <li>「如果跌破 A，就會再跌到 B」這種有條件的預測：要先跌破 A 才開始等 B；到期都沒有跌破 A，就是「條件沒發生」，不算對也不算錯。</li>
      <li>利率決策這種不是價格的預測，到期後由主持人照實際發生的事標記。</li>
      <li>本站的價格來自 Yahoo Finance，和分析師用的圖表可能差一點點（比特幣常差幾十美元），剛好在目標附近時以本站的資料為準。</li>
    </ul>
  );
}

function HowToAdd() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-fg">
      <p>YouTube 會擋雲端的主機自動讀影片內容，所以這裡只能自動抓到影片清單（標題、日期）。想看某一支的重點：</p>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>用電腦打開那支 YouTube 影片，按說明欄的「…更多」，再按「顯示轉錄稿」。</li>
        <li>在旁邊出現的轉錄稿裡全選、複製（英文也可以）。</li>
        <li>貼到和 Claude 的對話裡。Claude 會整理成中文重點、記下他的預測，更新到這一頁。</li>
      </ol>
      <p>想追蹤新的分析師：把他的 YouTube 頻道網址給 Claude，之後每天會自動列出他的新影片。</p>
    </div>
  );
}
