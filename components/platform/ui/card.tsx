/**
 * @file components/platform/ui/card.tsx
 *
 * Surfaces that sit on the content plane. None of these use glass.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CountUp } from '@/components/platform/ui/count-up';

type CardProps = {
  readonly title?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
};

export function Card({ title, action, children }: CardProps): JSX.Element {
  return (
    <section className="glass-card rounded-lg p-4">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm text-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type StatProps = {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly icon?: LucideIcon;
  readonly tone?: 'rose' | 'amber' | 'sky' | 'mint';
  readonly delta?: string;
  readonly deltaTone?: 'up' | 'down' | 'flat';
};

const TONE: Record<NonNullable<StatProps['tone']>, string> = {
  rose: 'bg-rose/15 text-rose',
  amber: 'bg-amber/15 text-amber',
  sky: 'bg-sky/15 text-sky',
  mint: 'bg-mint/15 text-mint',
};

export function StatTile({ label, value, hint, icon: Icon, tone = 'rose', delta, deltaTone = 'flat' }: StatProps): JSX.Element {
  const numeric = value.replace(/[^0-9.]/g, '');
  const suffix = value.replace(/[0-9.,\s]/g, '').trim();
  return (
    <div className="glass-card rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-ink-faint">{label}</p>
        {Icon ? (
          <span className={`grid h-8 w-8 place-items-center rounded-md ${TONE[tone]}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-display font-light tabular-nums text-ink">
        {numeric.length > 0 && !value.includes('/') ? <CountUp value={Number(numeric)} digits={value.includes('.') ? 2 : 0} suffix={suffix ? ` ${suffix}` : ''} /> : value}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {delta ? <DeltaPill tone={deltaTone}>{delta}</DeltaPill> : null}
        {hint ? <p className="text-xs text-ink-soft">{hint}</p> : null}
      </div>
    </div>
  );
}

type DeltaProps = {
  readonly tone?: 'up' | 'down' | 'flat';
  readonly children: ReactNode;
};

export function DeltaPill({ tone = 'flat', children }: DeltaProps): JSX.Element {
  const color = tone === 'up' ? 'bg-mint/15 text-mint' : tone === 'down' ? 'bg-danger/15 text-danger' : 'bg-white/5 text-ink-soft';
  return <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs tabular-nums ${color}`}>{children}</span>;
}

type BadgeProps = {
  readonly children: ReactNode;
};

export function Badge({ children }: BadgeProps): JSX.Element {
  return <span className="inline-flex items-center rounded-md bg-[var(--brand-tint)] px-2 py-0.5 text-xs text-ink">{children}</span>;
}

type PillTone = 'neutral' | 'ok' | 'warn' | 'fault';

const PILL: Record<PillTone, string> = {
  neutral: 'bg-raised text-ink-soft',
  ok: 'bg-[var(--ok-tint)] text-[var(--ok)]',
  warn: 'bg-[var(--warn-tint)] text-[var(--warn)]',
  fault: 'bg-[var(--fault-tint)] text-[var(--fault-ink)]',
};

type PillProps = {
  readonly tone?: PillTone;
  readonly children: ReactNode;
};

export function StatusPill({ tone = 'neutral', children }: PillProps): JSX.Element {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${PILL[tone]}`}>{children}</span>;
}
