import type { ColorMode, ResolvedTheme } from './store/settings';

/** 給 lightweight-charts（canvas）用的實際色碼；要和 index.css 的 token 一致。 */
export interface ChartTheme {
  background: string;
  text: string;
  textMuted: string;
  grid: string;
  border: string;
  up: string;
  down: string;
  accent: string;
  hot: string;
  cold: string;
  /** 指標線條用的配色（避開紅綠，免得和漲跌混淆） */
  series: string[];
}

const BASE = {
  dark: {
    background: '#111a2e',
    text: '#e6edf7',
    textMuted: '#9aa8bd',
    grid: 'rgba(148, 163, 184, 0.10)',
    border: '#26324d',
    red: '#f05252',
    green: '#22c55e',
    accent: '#60a5fa',
    hot: '#f59e0b',
    cold: '#38bdf8',
    series: ['#f59e0b', '#60a5fa', '#c084fc', '#2dd4bf', '#f472b6', '#a3e635', '#e2e8f0'],
  },
  light: {
    background: '#ffffff',
    text: '#0f172a',
    textMuted: '#5b6b82',
    grid: 'rgba(100, 116, 139, 0.12)',
    border: '#dde3ec',
    red: '#dc2626',
    green: '#16a34a',
    accent: '#2563eb',
    hot: '#d97706',
    cold: '#0284c7',
    series: ['#d97706', '#2563eb', '#9333ea', '#0d9488', '#db2777', '#65a30d', '#334155'],
  },
} as const;

export function getChartTheme(theme: ResolvedTheme, colorMode: ColorMode): ChartTheme {
  const b = BASE[theme];
  const up = colorMode === 'tw' ? b.red : b.green;
  const down = colorMode === 'tw' ? b.green : b.red;
  return {
    background: b.background,
    text: b.text,
    textMuted: b.textMuted,
    grid: b.grid,
    border: b.border,
    up,
    down,
    accent: b.accent,
    hot: b.hot,
    cold: b.cold,
    series: [...b.series],
  };
}

/** 把 #rrggbb 轉成帶透明度的 rgba() */
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
