import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { Timeframe } from '../data/resample';
import type { Params } from '../indicators/types';

export type ColorMode = 'tw' | 'intl';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type RangeKey = '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

export const RANGE_LABELS: Record<RangeKey, string> = {
  '3M': '3 個月',
  '6M': '6 個月',
  '1Y': '1 年',
  '3Y': '3 年',
  '5Y': '5 年',
  ALL: '全部',
};

/** 區間大約是幾個「日曆天」 */
export const RANGE_DAYS: Record<RangeKey, number> = {
  '3M': 92,
  '6M': 183,
  '1Y': 365,
  '3Y': 1096,
  '5Y': 1826,
  ALL: Number.POSITIVE_INFINITY,
};

export interface ChartIndicatorSetting {
  id: string;
  /** null = 使用該市場的常用參數 */
  params: Params | null;
}

export interface SettingsData {
  colorMode: ColorMode;
  theme: ThemeMode;
  chartIndicators: ChartIndicatorSetting[];
  /** 圖上要標示哪個指標的買賣訊號（null = 自動選第一個有訊號的） */
  signalIndicator: string | null;
  adjusted: boolean;
  timeframe: Timeframe;
  range: RangeKey;
  lastAsset: string;
}

export const DEFAULT_SETTINGS: SettingsData = {
  colorMode: 'tw',
  theme: 'system',
  chartIndicators: [
    { id: 'sma', params: null },
    { id: 'volume', params: null },
    { id: 'kd', params: null },
  ],
  signalIndicator: null,
  adjusted: false,
  timeframe: 'D',
  range: '1Y',
  lastAsset: '0050',
};

const STORAGE_KEY = 'ta-settings-v1';

function sanitize(raw: unknown): SettingsData {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<SettingsData>;
  const d = DEFAULT_SETTINGS;
  const pick = <T,>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback);
  const indicators = Array.isArray(s.chartIndicators)
    ? s.chartIndicators
        .filter((x): x is ChartIndicatorSetting => !!x && typeof x === 'object' && typeof (x as ChartIndicatorSetting).id === 'string')
        .map((x) => ({ id: x.id, params: x.params && typeof x.params === 'object' ? x.params : null }))
    : d.chartIndicators;
  return {
    colorMode: pick(s.colorMode, ['tw', 'intl'] as const, d.colorMode),
    theme: pick(s.theme, ['system', 'light', 'dark'] as const, d.theme),
    chartIndicators: indicators,
    signalIndicator: typeof s.signalIndicator === 'string' ? s.signalIndicator : null,
    adjusted: typeof s.adjusted === 'boolean' ? s.adjusted : d.adjusted,
    timeframe: pick(s.timeframe, ['D', 'W', 'M'] as const, d.timeframe),
    range: pick(s.range, ['3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const, d.range),
    lastAsset: typeof s.lastAsset === 'string' ? s.lastAsset : d.lastAsset,
  };
}

function load(): SettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(s: SettingsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 私密瀏覽或停用儲存空間時忽略，設定只是不會被記住
  }
}

interface SettingsStore extends SettingsData {
  update(patch: Partial<SettingsData>): void;
  addIndicator(id: string): void;
  removeIndicator(id: string): void;
  setIndicatorParams(id: string, params: Params | null): void;
  reset(): void;
}

export const useSettings = create<SettingsStore>((set) => ({
  ...load(),
  update: (patch) => set(patch),
  addIndicator: (id) =>
    set((s) => (s.chartIndicators.some((x) => x.id === id) ? s : { chartIndicators: [...s.chartIndicators, { id, params: null }] })),
  removeIndicator: (id) =>
    set((s) => ({
      chartIndicators: s.chartIndicators.filter((x) => x.id !== id),
      signalIndicator: s.signalIndicator === id ? null : s.signalIndicator,
    })),
  setIndicatorParams: (id, params) =>
    set((s) => ({ chartIndicators: s.chartIndicators.map((x) => (x.id === id ? { ...x, params } : x)) })),
  reset: () => set({ ...DEFAULT_SETTINGS }),
}));

useSettings.subscribe((s) => {
  save({
    colorMode: s.colorMode,
    theme: s.theme,
    chartIndicators: s.chartIndicators,
    signalIndicator: s.signalIndicator,
    adjusted: s.adjusted,
    timeframe: s.timeframe,
    range: s.range,
    lastAsset: s.lastAsset,
  });
});

function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** 實際使用中的主題（「跟隨系統」時會隨系統切換） */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useSettings((s) => s.theme);
  const [sys, setSys] = useState<ResolvedTheme>(systemTheme);
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-color-scheme: light)');
    } catch {
      return;
    }
    const onChange = () => setSys(mq!.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq!.removeEventListener('change', onChange);
  }, []);
  return theme === 'system' ? sys : theme;
}
