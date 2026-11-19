'use client';

/**
 * Charts in the dashboard palette. Lines draw once. Legends are chips with values.
 */

import { useId } from 'react';
import Link from 'next/link';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
  readonly xKey?: string;
  readonly showAxes?: boolean;
  readonly stacked?: boolean;
  readonly valueFormatter?: (value: number) => string;
};

function compactTick(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

const axisTickStyle = {
  fill: 'rgba(244, 240, 246, 0.52)',
  fontSize: 11,
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

export function AreaTrend({ data, series, height = 240, xKey = 'label', showAxes = true, valueFormatter }: TrendProps): JSX.Element {
  const uid = useId().replace(/:/g, '');
  return (
    <div>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={[...data]} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            {series.map((item) => (
              <linearGradient key={item.key} id={`fill-${uid}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={item.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {showAxes ? (
            <>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey={xKey} tick={axisTickStyle} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis width={44} tick={axisTickStyle} tickLine={false} axisLine={false} tickFormatter={compactTick} />
            </>
          ) : null}
          <Tooltip
            contentStyle={tooltipStyle}
            {...(valueFormatter ? { formatter: (value: number) => valueFormatter(Number(value)) } : {})}
          />
          {series.map((item) => (
            <Area key={item.key} type="monotone" dataKey={item.key} name={item.label} stackId="sales" stroke={item.color} fill={`url(#fill-${uid}-${item.key})`} strokeWidth={2} isAnimationActive />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineTrend({ data, series, height = 220, xKey = 'label', showAxes = true, valueFormatter }: TrendProps): JSX.Element {
  return (
    <div>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={[...data]} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          {showAxes ? (
            <>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey={xKey} tick={axisTickStyle} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis width={44} tick={axisTickStyle} tickLine={false} axisLine={false} tickFormatter={compactTick} />
            </>
          ) : null}
          <Tooltip
            contentStyle={tooltipStyle}
            {...(valueFormatter ? { formatter: (value: number) => valueFormatter(Number(value)) } : {})}
          />
          {series.map((item) => (
            <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} dot={false} isAnimationActive />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarTrend({ data, series, height = 220, xKey = 'label', showAxes = true, stacked = false, valueFormatter }: TrendProps): JSX.Element {
  return (
    <div>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={[...data]} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          {showAxes ? (
            <>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey={xKey} tick={axisTickStyle} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis width={36} allowDecimals={false} tick={axisTickStyle} tickLine={false} axisLine={false} tickFormatter={compactTick} />
            </>
          ) : null}
          <Tooltip
            contentStyle={tooltipStyle}
            {...(valueFormatter ? { formatter: (value: number) => valueFormatter(Number(value)) } : {})}
          />
          {series.map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              fill={item.color}
              radius={stacked ? [2, 2, 0, 0] : [8, 8, 0, 0]}
              isAnimationActive
              {...(stacked ? { stackId: 'stack' } : {})}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const RANK_PALETTE = [
  CHART_COLORS.rose,
  CHART_COLORS.sky,
  CHART_COLORS.amber,
  CHART_COLORS.mint,
] as const;

export type RankedBarItem = {
  readonly id: string;
  readonly rank: number;
  readonly label: string;
  readonly sublabel?: string;
  readonly value: number;
  readonly primaryText: string;
  readonly secondaryText?: string;
  readonly color?: string;
  readonly href?: string;
};

export function RankedBars({
  items,
  empty = 'Nothing recorded in this range.',
}: {
  readonly items: readonly RankedBarItem[];
  readonly empty?: string;
}): JSX.Element {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-ink-soft">{empty}</p>;
  }
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ol className="mt-3 space-y-2.5">
      {items.map((item, index) => {
        const barColor = item.color ?? RANK_PALETTE[index % RANK_PALETTE.length] ?? CHART_COLORS.rose;
        const widthPct = item.value > 0 ? Math.max(6, Math.round((item.value / max) * 100)) : 0;
        const inner = (
          <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white/[0.06] font-num text-[11px] text-ink-soft">
              {item.rank}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{item.label}</p>
              {item.sublabel ? <p className="truncate text-[11px] text-ink-faint">{item.sublabel}</p> : null}
            </div>
            <div className="h-2 min-w-[40px] overflow-hidden rounded-pill bg-white/10">
              <div className="h-full rounded-pill transition-[width] duration-300" style={{ width: `${widthPct}%`, background: barColor }} />
            </div>
            <div className="shrink-0 text-right">
              <p className="font-num text-sm text-ink">{item.primaryText}</p>
              {item.secondaryText ? <p className="font-num text-[11px] text-ink-faint">{item.secondaryText}</p> : null}
            </div>
          </div>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="block rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]">
                {inner}
              </Link>
            ) : (
              <div className="rounded-lg px-2 py-1.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
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
