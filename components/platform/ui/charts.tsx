'use client';

/**
 * Charts in the dashboard palette. Lines draw once. Legends are chips with values.
 */

import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export const CHART_COLORS = {
  rose: '#FF4D8D',
  amber: '#F5B042',
  sky: '#5B9DFF',
  mint: '#3DDC97',
} as const;

type Point = Record<string, string | number>;

type Series = {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly value?: string;
};

type TrendProps = {
  readonly data: readonly Point[];
  readonly series: readonly Series[];
  readonly height?: number;
};

function Legend({ series }: { readonly series: readonly Series[] }): JSX.Element {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {series.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-2 rounded-pill border border-stroke px-2 py-1 text-xs text-ink-soft">
          <span className="h-2 w-2 rounded-pill" style={{ background: item.color }} />
          {item.label}
          {item.value ? <span className="tabular-nums text-ink">{item.value}</span> : null}
        </span>
      ))}
    </div>
  );
}

const tooltipStyle = {
  background: 'rgb(20 12 16)',
  border: '1px solid rgb(255 255 255 / 0.12)',
  borderRadius: 12,
  color: '#F4F0F6',
};

export function AreaTrend({ data, series, height = 240 }: TrendProps): JSX.Element {
  return (
    <div>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={[...data]}>
          <defs>
            {series.map((item) => (
              <linearGradient key={item.key} id={`fill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={item.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <Tooltip contentStyle={tooltipStyle} />
          {series.map((item) => (
            <Area key={item.key} type="monotone" dataKey={item.key} stackId="sales" stroke={item.color} fill={`url(#fill-${item.key})`} strokeWidth={2} isAnimationActive />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineTrend({ data, series, height = 220 }: TrendProps): JSX.Element {
  return (
    <div>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={[...data]}>
          <Tooltip contentStyle={tooltipStyle} />
          {series.map((item) => (
            <Line key={item.key} type="monotone" dataKey={item.key} stroke={item.color} strokeWidth={2} dot={false} isAnimationActive />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarTrend({ data, series, height = 220 }: TrendProps): JSX.Element {
  return (
    <div>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={[...data]}>
          <Tooltip contentStyle={tooltipStyle} />
          {series.map((item) => (
            <Bar key={item.key} dataKey={item.key} fill={item.color} radius={[8, 8, 0, 0]} isAnimationActive />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type DonutProps = {
  readonly slices: readonly { readonly name: string; readonly value: number; readonly color: string }[];
};

export function DonutShare({ slices }: DonutProps): JSX.Element {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[160px_1fr]">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={[...slices]} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} stroke="none" isAnimationActive>
            {slices.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-2">
        {slices.map((slice) => (
          <li key={slice.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-ink-soft">
              <span className="h-2 w-2 rounded-pill" style={{ background: slice.color }} />
              {slice.name}
            </span>
            <span className="tabular-nums text-ink">{total > 0 ? Math.round((slice.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ data, color = CHART_COLORS.rose }: { readonly data: readonly number[]; readonly color?: string }): JSX.Element {
  const points = data.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={points}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RadialRing({ progress, label }: { readonly progress: number; readonly label: string }): JSX.Element {
  const clamped = Math.max(0, Math.min(1, progress));
  const ring = 2 * Math.PI * 28;
  return (
    <div className="flex items-center gap-3">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r="28" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="6" />
        <circle cx="36" cy="36" r="28" fill="none" stroke={CHART_COLORS.rose} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${ring} ${ring}`} strokeDashoffset={ring * (1 - clamped)} transform="rotate(-90 36 36)" />
      </svg>
      <p className="text-sm text-ink">{label}</p>
    </div>
  );
}

export function StageBars({ stages }: { readonly stages: readonly { readonly label: string; readonly value: number; readonly color: string }[] }): JSX.Element {
  const max = Math.max(1, ...stages.map((stage) => stage.value));
  return (
    <ul className="space-y-2">
      {stages.map((stage) => (
        <li key={stage.label} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-sm">
          <span className="text-ink-soft">{stage.label}</span>
          <span className="h-2 overflow-hidden rounded-pill bg-white/10">
            <span className="block h-full rounded-pill" style={{ width: `${(stage.value / max) * 100}%`, background: stage.color }} />
          </span>
          <span className="text-right tabular-nums text-ink">{stage.value}</span>
        </li>
      ))}
    </ul>
  );
}
