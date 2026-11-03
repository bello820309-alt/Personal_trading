import { useEffect, type ReactElement } from 'react';
import { Layout } from './components/Layout';
import { matchPath, useLocation } from './router';
import { useResolvedTheme, useSettings } from './store/settings';
import { Dashboard } from './pages/Dashboard';
import { ChartPage } from './pages/ChartPage';
import { LearnIndex } from './pages/LearnIndex';
import { LearnDetail } from './pages/LearnDetail';
import { BasicsPage } from './pages/BasicsPage';
import { GlossaryPage } from './pages/GlossaryPage';
import { BacktestPage } from './pages/BacktestPage';
import { RankPage } from './pages/RankPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFound } from './pages/NotFound';

const ROUTES: { pattern: string; render: (p: Record<string, string>) => ReactElement }[] = [
  { pattern: '/', render: () => <Dashboard /> },
  { pattern: '/chart', render: () => <ChartPage /> },
  { pattern: '/chart/:asset', render: (p) => <ChartPage assetId={p.asset} /> },
  { pattern: '/learn', render: () => <LearnIndex /> },
  { pattern: '/learn/:id', render: (p) => <LearnDetail id={p.id!} /> },
  { pattern: '/basics/:id', render: (p) => <BasicsPage id={p.id!} /> },
  { pattern: '/glossary', render: () => <GlossaryPage /> },
  { pattern: '/backtest', render: () => <BacktestPage /> },
  { pattern: '/backtest/rank', render: () => <RankPage /> },
  { pattern: '/settings', render: () => <SettingsPage /> },
];

export function App() {
  const { path } = useLocation();
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#f5f7fb');
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.color = colorMode;
  }, [colorMode]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  let page: ReactElement = <NotFound />;
  for (const r of ROUTES) {
    const params = matchPath(r.pattern, path);
    if (params) {
      page = r.render(params);
      break;
    }
  }
  return <Layout>{page}</Layout>;
}
