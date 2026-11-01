import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';

export interface BandPoint {
  time: Time;
  upper: number;
  lower: number;
}

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

/**
 * 在兩條線之間填色（布林通道、肯特納通道、一目均衡表的雲）。
 * lightweight-charts 沒有內建「兩線之間填色」，所以用 primitive 自己畫。
 * 當 lower 在 upper 之上時改用 invertedColor（一目均衡表的多方雲／空方雲）。
 */
export class BandFill implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private readonly views: readonly IPrimitivePaneView[];

  constructor(
    private readonly points: BandPoint[],
    private readonly color: string,
    private readonly invertedColor: string,
  ) {
    const renderer: IPrimitivePaneRenderer = { draw: (target) => this.draw(target) };
    this.views = [{ zOrder: () => 'bottom', renderer: () => renderer }];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<SeriesType>;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  private draw(target: DrawTarget): void {
    const chart = this.chart;
    const series = this.series;
    if (!chart || !series) return;
    const ts = chart.timeScale();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      type P = { x: number; yu: number; yl: number; inverted: boolean };
      const pts: P[] = [];
      for (const p of this.points) {
        const x = ts.timeToCoordinate(p.time);
        if (x === null || x < -40 || x > mediaSize.width + 40) {
          if (pts.length) pts.push({ x: NaN, yu: NaN, yl: NaN, inverted: false });
          continue;
        }
        const yu = series.priceToCoordinate(p.upper);
        const yl = series.priceToCoordinate(p.lower);
        if (yu === null || yl === null) continue;
        pts.push({ x, yu, yl, inverted: p.lower > p.upper });
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        if (Number.isNaN(a.x) || Number.isNaN(b.x)) continue;
        ctx.fillStyle = a.inverted ? this.invertedColor : this.color;
        ctx.beginPath();
        ctx.moveTo(a.x, a.yu);
        ctx.lineTo(b.x, b.yu);
        ctx.lineTo(b.x, b.yl);
        ctx.lineTo(a.x, a.yl);
        ctx.closePath();
        ctx.fill();
      }
    });
  }
}
