/**
 * @file components/platform/ui/feedback.tsx
 *
 * Loading, failure, and the next action when a list is empty.
 */

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/platform/ui/button';

type SkeletonProps = {
  readonly className?: string;
};

export function Skeleton({ className = 'h-4 w-full' }: SkeletonProps): JSX.Element {
  return <span aria-hidden="true" className={`block rounded-md bg-raised ${className}`} />;
}

type ErrorStateProps = {
  readonly title?: string;
  readonly message: string;
  readonly requestId?: string | undefined;
  readonly detail?: string | undefined;
  readonly onRetry?: () => void;
};

export function ErrorState({ title = 'This did not load', message, requestId, detail, onRetry }: ErrorStateProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    setOwner(document.documentElement.dataset.role === 'owner');
  }, []);
  const body = message.trim() === title.trim() ? '' : message;
  const extra = owner ? detail : undefined;
  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-4">
      <p className="text-sm text-ink">{title}</p>
      {body ? <p className="mt-1 text-sm text-danger">{body}</p> : null}
      {onRetry ? (
        <div className="mt-3">
          <Button variant="secondary" onClick={onRetry}>Try again</Button>
        </div>
      ) : null}
      {owner && (extra || requestId) ? (
        <div className="mt-3">
          <button type="button" className="text-xs text-ink-soft" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
            {open ? 'Hide details' : 'Details'}
          </button>
          {open ? (
            <p className="mt-2 font-mono text-xs text-ink-soft">
              {extra ? <span className="block">{extra}</span> : null}
              {requestId ? <span className="block">Request {requestId}</span> : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type EmptyStateProps = {
  readonly title: string;
  readonly message: string;
  readonly action?: ReactNode;
};

export function EmptyState({ title, message, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-stroke px-4 py-8 text-center">
      <p className="text-sm text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
