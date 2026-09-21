/**
 * @file components/charts/DonutChart.tsx
 *
 * SVG donut/ring chart with optional multi-segment breakdown.
 * Used for wallet usage, order completion, and revenue mix.
 *
 * @module Components
 */

'use client';

export type DonutSegment = {
  readonly value: number;
  readonly color: string;
  readonly label: string;
};

type DonutChartProps = {
  readonly value?: number;
  readonly total: string;
  readonly label: string;
  readonly color?: string;
  readonly size?: number;
  readonly thickness?: number;
  readonly segments?: ReadonlyArray<DonutSegment>;
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function toArcs(
  segments: ReadonlyArray<DonutSegment>,
  circumference: number,
): ReadonlyArray<{ readonly color: string; readonly dash: number; readonly offset: number; readonly label: string }> {
  const totalValue = segments.reduce((sum, segment) => sum + segment.value, 0);
  const safeTotal = totalValue > 0 ? totalValue : 1;
  let cursor = 0;
  return segments.map((segment) => {
    const dash = circumference * (segment.value / safeTotal);
    const offset = cursor;
    cursor += dash;
    return { color: segment.color, dash, offset, label: segment.label };
  });
}

/**
 * Renders a circular progress ring with a center label.
 *
 * @param props - Percentage or segments, center copy, and sizing
 */
export function DonutChart({
  value = 0,
  total,
  label,
  color = 'var(--accent)',
  size = 120,
  thickness = 10,
  segments,
}: DonutChartProps): JSX.Element {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const filled = circumference * (clampPercent(value) / 100);
  const arcs = segments && segments.length > 0 ? toArcs(segments, circumference) : null;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--bg-raised)"
          strokeWidth={thickness}
        />
        {arcs
          ? arcs.map((arc) => (
              <circle
                key={arc.label}
                className="donut-ring"
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                style={{
                  transformOrigin: 'center',
                  transform: 'rotate(-90deg)',
                  filter: `drop-shadow(0 0 8px ${arc.color})`,
                  ['--circumference' as string]: String(circumference),
                  ['--offset' as string]: String(-arc.offset),
                  strokeDashoffset: -arc.offset,
                }}
              />
            ))
          : (
              <circle
                className="donut-ring"
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${circumference - filled}`}
                style={{
                  transformOrigin: 'center',
                  filter: `drop-shadow(0 0 8px ${color})`,
                  ['--circumference' as string]: String(circumference),
                  ['--offset' as string]: String(circumference - filled),
                }}
              />
            )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <p className="text-sm font-bold leading-tight text-[var(--text-1)]">{total}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-2)]">{label}</p>
      </div>
    </div>
  );
}

export default DonutChart;
