/**
 * @file components/charts/MiniBarChart.tsx
 *
 * Inline sparkline bar chart for 7-day revenue and order volume trends.
 *
 * @module Components
 */

type MiniBarChartProps = {
  readonly values: ReadonlyArray<number>;
  readonly width?: number;
  readonly height?: number;
  readonly color?: string;
};

/**
 * Renders compact SVG bars. The last bar is highlighted.
 *
 * @param props - Numeric series and optional size/color
 */
export function MiniBarChart({
  values,
  width = 120,
  height = 36,
  color = 'var(--accent)',
}: MiniBarChartProps): JSX.Element {
  const peak = Math.max(...values, 1);
  const gap = 3;
  const barWidth = values.length === 0 ? 0 : (width - gap * (values.length - 1)) / values.length;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {values.map((value, index) => {
        const barHeight = Math.max(2, (value / peak) * height);
        const x = index * (barWidth + gap);
        const isLast = index === values.length - 1;
        return (
          <rect
            key={`${index}-${value}`}
            x={x}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={2}
            fill={isLast ? color : 'var(--bg-overlay)'}
            opacity={isLast ? 1 : 0.85}
          />
        );
      })}
    </svg>
  );
}

export default MiniBarChart;
