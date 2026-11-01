import { getContent, lineGuideText } from '../content';
import type { IndicatorDef, IndicatorResult, LineOutput, Signal } from '../indicators/types';
import { useResolvedTheme, useSettings } from '../store/settings';
import { getChartTheme, type ChartTheme } from '../theme';
import { orderedLines } from './chart/legend';
import { resolveColor } from './chart/PriceChart';

function useChartTheme(): ChartTheme {
  const theme = useResolvedTheme();
  const colorMode = useSettings((s) => s.colorMode);
  return getChartTheme(theme, colorMode);
}

/** 和圖上長得一樣的小樣本：線、柱子、點；會逐根變色的（例如 MACD 柱狀體）同時畫出兩種顏色 */
function GuideSwatch({ line, t }: { line: LineOutput; t: ChartTheme }) {
  const twoTone = !!line.colors;
  const main = resolveColor(t, line.color);
  if (line.kind === 'histogram') {
    return (
      <span className="inline-flex h-3 w-[18px] items-end gap-[2px]" aria-hidden>
        <span className="inline-block h-3 w-[5px] rounded-[1px]" style={{ background: twoTone ? t.up : main }} />
        <span className="inline-block h-2 w-[5px] rounded-[1px]" style={{ background: twoTone ? t.down : main }} />
        <span className="inline-block h-2.5 w-[5px] rounded-[1px]" style={{ background: twoTone ? t.up : main }} />
      </span>
    );
  }
  if (line.kind === 'dots') {
    return (
      <span className="inline-flex w-[18px] items-center gap-[3px]" aria-hidden>
        <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: twoTone ? t.up : main }} />
        <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: twoTone ? t.down : main }} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block w-[18px]"
      style={{ borderTop: `${line.width && line.width > 1 ? 3 : 2}px ${line.dashed ? 'dashed' : 'solid'} ${main}` }}
    />
  );
}

/** 「圖上的線」：每條線的顏色樣本＋白話說明（barUnit：週 K 傳「週」、月 K 傳「個月」） */
export function LineGuide({ def, result, barUnit }: { def: IndicatorDef; result: IndicatorResult; barUnit?: string }) {
  const t = useChartTheme();
  const c = getContent(def.id);
  const lines = orderedLines(result);
  return (
    <ul className="space-y-2 text-sm leading-relaxed">
      {lines.map((l) => {
        const text = lineGuideText(c, l, barUnit) ?? l.label;
        const cut = text.indexOf('：');
        return (
          <li key={l.key} className="flex gap-2.5">
            <span className="flex h-[1.6em] shrink-0 items-center">
              <GuideSwatch line={l} t={t} />
            </span>
            <span className="text-muted">
              {cut > 0 ? (
                <>
                  <span className="font-medium text-fg">{text.slice(0, cut)}</span>
                  {text.slice(cut)}
                </>
              ) : (
                text
              )}
            </span>
          </li>
        );
      })}
      {c?.chartNote && (
        <li className="flex gap-2.5">
          <span className="flex h-[1.6em] shrink-0 items-center">
            <span aria-hidden className="inline-block w-[18px] border-t-2 border-dotted" style={{ borderColor: t.textMuted }} />
          </span>
          <span className="text-muted">{c.chartNote}</span>
        </li>
      )}
    </ul>
  );
}

/** 「圖上的箭頭」：說明 K 線旁邊的買賣箭頭代表什麼訊號 */
export function ArrowGuide({ signals }: { signals: Signal[] }) {
  const t = useChartTheme();
  const buy = signals.find((s) => s.side === 'buy')?.label;
  const sell = signals.find((s) => s.side === 'sell')?.label;
  if (!buy && !sell) return null;
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed">
      {buy && (
        <li className="flex gap-2.5">
          <span className="flex h-[1.6em] w-[18px] shrink-0 items-center justify-center" style={{ color: t.up }} aria-hidden>
            ▲
          </span>
          <span className="text-muted">
            <span className="font-medium text-fg">K 線下方往上的箭頭</span>：買進訊號（{buy}）
          </span>
        </li>
      )}
      {sell && (
        <li className="flex gap-2.5">
          <span className="flex h-[1.6em] w-[18px] shrink-0 items-center justify-center" style={{ color: t.down }} aria-hidden>
            ▼
          </span>
          <span className="text-muted">
            <span className="font-medium text-fg">K 線上方往下的箭頭</span>：賣出訊號（{sell}）
          </span>
        </li>
      )}
    </ul>
  );
}
