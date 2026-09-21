/**
 * @file components/charts/StatRing.tsx
 *
 * Compact ring indicator for a single metric (48px, no center text).
 *
 * @module Components
 */

type StatRingProps = {
  readonly value: number;
  readonly color?: string;
  readonly size?: number;
  readonly thickness?: number;
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Renders a small progress ring for table rows and stat cards.
 *
 * @param props - Percentage 0–100 and optional color/size
 */
export function StatRing({
  value,
  color = 'var(--accent)',
  size = 48,
  thickness = 5,
}: StatRingProps): JSX.Element {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const filled = circumference * (clampPercent(value) / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--bg-raised)"
        strokeWidth={thickness}
      />
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
          filter: `drop-shadow(0 0 6px ${color})`,
          ['--circumference' as string]: String(circumference),
          ['--offset' as string]: String(circumference - filled),
        }}
      />
    </svg>
  );
}

export default StatRing;
