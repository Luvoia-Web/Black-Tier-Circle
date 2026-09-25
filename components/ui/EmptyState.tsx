'use client';

import Link from 'next/link';
import { LottiePlayer } from '@/components/motion/LottiePlayer';
import { FadeUp } from '@/components/motion/FadeUp';

type EmptyStateProps = {
  readonly icon?: string;
  readonly title: string;
  readonly description: string;
  readonly action?: { readonly label: string; readonly href?: string; readonly onClick?: () => void };
};

export function EmptyState({ title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
      <LottiePlayer name="empty-box" className="mb-2 h-24 w-24" />
      <FadeUp>
        <h3 className="text-base font-medium text-[var(--text-1)]">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-[var(--text-2)]">{description}</p>
      </FadeUp>
      {action?.href ? (
        <Link href={action.href} className="btc-btn-primary mt-6">
          {action.label}
        </Link>
      ) : null}
      {action?.onClick ? (
        <button type="button" onClick={action.onClick} className="btc-btn-primary mt-6">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
