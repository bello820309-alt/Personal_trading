import type {
  IChartApiBase,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  Logical,
  PaneAttachedParameter,
  Time,
} from 'lightweight-charts';
import { withAlpha } from '../../theme';

/** 圖上標出的區間：from、to 是 K 棒的位置；還沒選終點時 to 是 null（只畫起點的線） */
export interface ShadeRange {
  from: number;
  to: number | null;
  color: string;
}

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

/**
 * 「區間漲跌」在圖上的標示：起點、終點各一條直線，中間淡淡地塗色。
 * 每個區塊（主圖、副圖）各放一個，讓直線貫穿整張圖。
 */
export class RangeShade implements IPanePrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private readonly views: readonly IPanePrimitivePaneView[];

  constructor(private range: ShadeRange | null) {
    const fill: IPrimitivePaneRenderer = { draw: (target) => this.draw(target, 'fill') };
    const lines: IPrimitivePaneRenderer = { draw: (target) => this.draw(target, 'lines') };
    this.views = [
      { zOrder: () => 'bottom', renderer: () => fill },
      { zOrder: () => 'top', renderer: () => lines },
    ];
  }

  attached({ chart, requestUpdate }: PaneAttachedParameter<Time>): void {
    this.chart = chart;
    this.requestUpdate = requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.requestUpdate = null;
  }

  paneViews(): readonly IPanePrimitivePaneView[] {
    return this.views;
  }

  setRange(range: ShadeRange | null): void {
    this.range = range;
    this.requestUpdate?.();
  }

  private draw(target: DrawTarget, layer: 'fill' | 'lines'): void {
    const r = this.range;
    const chart = this.chart;
    if (!r || !chart) return;
    const ts = chart.timeScale();
    const xa = ts.logicalToCoordinate(r.from as Logical);
    const xb = r.to === null ? null : ts.logicalToCoordinate(r.to as Logical);
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (layer === 'fill') {
        if (xa === null || xb === null) return;
        const left = Math.min(xa, xb);
        const right = Math.max(xa, xb);
        ctx.fillStyle = withAlpha(r.color, 0.12);
        ctx.fillRect(left, 0, Math.max(1, right - left), mediaSize.height);
        return;
      }
      ctx.strokeStyle = withAlpha(r.color, 0.9);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const x of [xa, xb]) {
        if (x === null) continue;
        const px = Math.round(x) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, mediaSize.height);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
  }
}
