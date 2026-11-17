/**
 * @file components/platform/ui/card.tsx
 *
 * Surfaces that sit on the content plane. None of these use glass.
 */

import type { ReactNode } from 'react';

type CardProps = {
  readonly title?: string;
  readonly children: ReactNode;
};

export function Card({ title, children }: CardProps): JSX.Element {
  return (
    <section className="rounded-lg border border-stroke bg-raised p-4">
      {title ? <h2 className="mb-2 text-sm text-ink">{title}</h2> : null}
      {children}
    </section>
  );
}

type StatProps = {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
};

export function StatTile({ label, value, hint }: StatProps): JSX.Element {
  return (
    <div className="rounded-lg border border-stroke bg-raised px-4 py-3">
      <p className="text-xs uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <p className="mt-1 text-right font-num text-xl text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
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
