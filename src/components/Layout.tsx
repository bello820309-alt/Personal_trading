import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Link, useLocation } from '../router';
import { BookIcon, ChartIcon, FlaskIcon, GearIcon, HomeIcon, LogoMark } from './icons';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: '總覽', short: '總覽', icon: HomeIcon, match: (p) => p === '/' },
  { to: '/chart', label: '圖表', short: '圖表', icon: ChartIcon, match: (p) => p.startsWith('/chart') },
  {
    to: '/learn',
    label: '指標百科',
    short: '百科',
    icon: BookIcon,
    match: (p) => p.startsWith('/learn') || p.startsWith('/basics') || p.startsWith('/glossary'),
  },
  { to: '/backtest', label: '回測', short: '回測', icon: FlaskIcon, match: (p) => p.startsWith('/backtest') },
  { to: '/settings', label: '設定與關於', short: '設定', icon: GearIcon, match: (p) => p.startsWith('/settings') },
];

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-wide text-fg">
      <LogoMark />
      <span>技術分析學堂</span>
    </Link>
  );
}

export function Disclaimer() {
  return (
    <p className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-muted">
      本工具僅供學習技術分析之用，所有訊號與回測結果都不構成投資建議；過去的績效不代表未來。行情資料來自 Yahoo
      Finance，可能有延遲或錯誤。
    </p>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <nav className="mt-8 space-y-1" aria-label="主選單">
          {NAV.map((item) => {
            const active = item.match(path);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active ? 'bg-accent/15 font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-3 text-xs leading-relaxed text-muted">0050 · VOO · 比特幣
          <br />比特幣每分鐘更新</p>
      </aside>

      <div className="md:pl-56">
        <header className="sticky top-0 z-30 flex h-12 items-center border-b border-line bg-bg/90 px-4 backdrop-blur md:hidden">
          <Brand />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-12">
          {children}
          <Disclaimer />
        </main>
      </div>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden"
        aria-label="主選單"
      >
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = item.match(path);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-accent' : 'text-muted'}`}
              >
                <Icon />
                {item.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
