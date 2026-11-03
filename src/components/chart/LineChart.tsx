import { memo, useEffect, useRef } from 'react';
import { ColorType, CrosshairMode, LineSeries, LineStyle, PriceScaleMode, createChart, type PriceFormat } from 'lightweight-charts';
import { useResolvedTheme, useSettings } from '../../store/settings';
import { getChartTheme, withAlpha } from '../../theme';

export interface LineSpec {
  key: string;
  label: string;
  color: string;
  width?: 1 | 2 | 3;
  points: { time: string; value: number }[];
  /** 在右邊的價格軸顯示最後的數值（線很多時可以關掉，避免標籤擠成一團） */
  showLastValue?: boolean;
  dashed?: boolean;
}

/** 簡單的多線折線圖（資產曲線、績效比較用） */
function LineChartImpl({
  lines,
  height = 280,
  logScale = false,
  format,
}: {
  lines: LineSpec[];
  height?: number;
  logScale?: boolean;
  format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = getChartTheme(theme, colorMode);
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: t.background },
        textColor: t.textMuted,
        fontSize: 11,
        fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', sans-serif",
        attributionLogo: true,
      },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border, mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal },
      timeScale: { borderColor: t.border },
      crosshair: { mode: CrosshairMode.Normal, horzLine: { color: withAlpha(t.accent, 0.5) } },
      localization: { locale: 'zh-TW', dateFormat: 'yyyy/MM/dd' },
      handleScroll: { vertTouchDrag: false },
    });
    const priceFormat: PriceFormat = format ? { type: 'custom', minMove: 0.01, formatter: format } : { type: 'price', precision: 0, minMove: 1 };
    for (const l of lines) {
      const s = chart.addSeries(LineSeries, {
        color: l.color,
        lineWidth: l.width ?? 2,
        lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: l.showLastValue ?? true,
        crosshairMarkerVisible: l.showLastValue ?? true,
        priceFormat,
      });
      s.setData(l.points.map((p) => ({ time: p.time, value: p.value })));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [lines, logScale, format, theme, colorMode]);

  return <div ref={ref} style={{ height }} className="w-full overflow-hidden rounded-lg border border-line" />;
}

export const LineChart = memo(LineChartImpl);
