/**
 * Manual trigger card for cron job endpoints.
 * Shows last run result inline after triggering.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

type CronStatus = 'idle' | 'loading' | 'success' | 'error';

type CronTriggerCardProps = {
  readonly title: string;
  readonly description: string;
  readonly endpoint: string;
  readonly icon: string;
};

function buttonLabel(status: CronStatus): string {
  if (status === 'loading') {
    return '⏳ Running...';
  }
  if (status === 'success') {
    return '✅ Done';
  }
  if (status === 'error') {
    return '❌ Failed';
  }
  return 'Run Now';
}

function buttonClass(status: CronStatus): string {
  const base = 'w-full rounded-[var(--r-md)] py-2 text-sm font-medium transition-all';
  if (status === 'loading') {
    return `${base} cursor-not-allowed bg-[var(--bg-raised)] text-[var(--text-3)]`;
  }
  if (status === 'success') {
    return `${base} border border-[var(--green)]/20 bg-[var(--green-soft)] text-[var(--green)]`;
  }
  if (status === 'error') {
    return `${base} border border-[var(--red)]/20 bg-[var(--red-soft)] text-[var(--red)]`;
  }
  return `${base} border border-[var(--border-soft)] bg-[var(--bg-raised)] text-[var(--text-1)] hover:border-[var(--accent)]`;
}

function summarizePayload(payload: unknown): string {
  const body = payload && typeof payload === 'object' ? (payload as { data?: unknown }) : null;
  const source = body?.data ?? payload;
  if (!source || typeof source !== 'object') {
    return 'Done';
  }
  const summary = Object.entries(source as Record<string, unknown>)
    .map(([key, value]) => {
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return `${key}: ${String(value)}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join(', ');
  return summary || 'Done';
}

function readErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return 'Failed';
  }
  const error = (payload as { error?: unknown }).error;
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Failed';
}

export function CronTriggerCard({ title, description, endpoint, icon }: CronTriggerCardProps): JSX.Element {
  const [status, setStatus] = useState<CronStatus>('idle');
  const [result, setResult] = useState<string | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function trigger(): Promise<void> {
    setStatus('loading');
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data: unknown = await res.json();
      if (res.ok) {
        setStatus('success');
        setResult(summarizePayload(data));
      } else {
        setStatus('error');
        setResult(readErrorMessage(data));
      }
    } catch {
      setStatus('error');
      setResult('Network error');
    }
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => {
      setStatus('idle');
      setResult(null);
    }, 5000);
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <span className="text-lg">{icon}</span>
          <h3 className="mt-1 text-sm font-medium text-[var(--text-1)]">{title}</h3>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">{description}</p>
        </div>
      </div>
      {result ? (
        <p className={`mb-2 text-xs ${status === 'success' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{result}</p>
      ) : null}
      <button type="button" onClick={() => void trigger()} disabled={status === 'loading'} className={buttonClass(status)}>
        {buttonLabel(status)}
      </button>
    </div>
  );
}
