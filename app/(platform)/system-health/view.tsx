'use client';

/**
 * Owner System health view: cron schedules (last & next run), supplier balances & trends,
 * bot webhook health, active job queue, failed jobs, error log, and launch readiness.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  RelativeTime,
  Skeleton,
  Sparkline,
  StatTile,
  StatusPill,
} from '@/components/platform/ui';
import { CHART_COLORS } from '@/components/platform/ui/charts';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { ROUTES } from '@/lib/navigation';
import type {
  HealthTone,
  SystemHealthCronJobId,
  SystemHealthPayload,
} from '@/modules/platform/system-health';
import { notify } from '@/components/platform/ui';

const CHECKLIST_GROUPS = [
  { id: 'environment', label: 'Environment' },
  { id: 'payment', label: 'Payments' },
  { id: 'bot', label: 'Telegram bots' },
  { id: 'product', label: 'Products & fulfillment' },
  { id: 'reseller', label: 'Resellers' },
] as const;

function nextRunLabel(iso: string): { readonly label: string; readonly title: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { label: 'Due soon', title: '' };
  }
  const title = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 30_000) {
    return { label: 'Due now', title };
  }
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) {
    return { label: `In ${minutes} min`, title };
  }
  const hours = Math.round(minutes / 60);
  return { label: `In ${hours} hr`, title };
}

function NextScheduleTime({ value }: { readonly value: string }): JSX.Element {
  const formatted = nextRunLabel(value);
  return (
    <time dateTime={value} title={formatted.title} className="tabular-nums text-ink-soft">
      {formatted.label}
    </time>
  );
}

function pillTone(tone: HealthTone): 'ok' | 'warn' | 'fault' | 'neutral' | 'info' {
  return tone;
}

export function SystemHealthView(): JSX.Element {
  const state = useData<SystemHealthPayload>('/api/platform/system-health');
  const [busyJob, setBusyJob] = useState<SystemHealthCronJobId | null>(null);
  const data = state.data;

  async function triggerJob(job: SystemHealthCronJobId): Promise<void> {
    setBusyJob(job);
    const result = await runAction<{ readonly triggered: string; readonly health: SystemHealthPayload }>(
      '/api/platform/system-health',
      { method: 'POST', body: { job } },
    );
    setBusyJob(null);
    if (!result.ok) {
      notify({ message: result.error.message, tone: 'fault' });
      return;
    }
    notify({ message: 'Health job completed.' });
    state.refetch();
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Operations</p>
          <h1 className="mt-1 text-[28px] font-medium tracking-tight text-ink sm:text-[30px]">
            System health
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Supplier balance trend, cron schedules, bot webhooks, active queues, and launch checks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={state.loading || busyJob !== null}
            onClick={() => state.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
          <Button
            variant="primary"
            loading={busyJob === 'supplier_sync'}
            disabled={busyJob !== null && busyJob !== 'supplier_sync'}
            onClick={() => void triggerJob('supplier_sync')}
          >
            Sync suppliers
          </Button>
        </div>
      </header>

      {state.loading && !data ? <Skeleton className="h-44 w-full" /> : null}
      {state.error && !data ? (
        <ErrorState
          message={state.error.message}
          requestId={state.error.requestId}
          detail={state.error.detail}
          onRetry={state.refetch}
        />
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <StatTile
              label="Launch readiness"
              value={data.summary.launchPassing}
              hint={data.summary.launchAllPassing ? 'Ready for launch' : 'Needs attention'}
              icon={ShieldCheck}
              tone={data.summary.launchAllPassing ? 'mint' : 'amber'}
            />
            <StatTile
              label="Suppliers healthy"
              value={data.summary.suppliersHealthy}
              hint={`${data.summary.totalSupplierBalance} USDT balance`}
              icon={Server}
              tone="rose"
            />
            <StatTile
              label="Telegram bots"
              value={data.summary.botsHealthy}
              hint="Connected bots"
              icon={Bot}
              tone="sky"
            />
            <StatTile
              label="Job queue"
              value={`${data.summary.activeJobs} active`}
              hint={`${data.summary.failedJobs} failed`}
              icon={Activity}
              tone={data.summary.failedJobs > 0 ? 'danger' : 'mint'}
            />
          </div>

          {/* Cron schedules: last run + next run */}
          <Card
            title="Scheduled cron jobs"
            action={
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Catalog sync runs on schedule & every reconcile pass
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              {data.crons.map((cron) => (
                <div
                  key={cron.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-stroke bg-black/20 p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{cron.label}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">{cron.cadenceLabel}</p>
                    </div>
                    <StatusPill tone={pillTone(cron.tone)}>{cron.statusLabel}</StatusPill>
                  </div>
                  <p className="text-xs text-ink-soft">{cron.detail}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-3 text-ink-faint">
                      <span>
                        Last run:{' '}
                        {cron.lastRunAt ? (
                          <RelativeTime value={cron.lastRunAt} />
                        ) : (
                          <span className="text-ink-soft">Never</span>
                        )}
                      </span>
                      <span>
                        Next run: <NextScheduleTime value={cron.nextRunAt} />
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      loading={busyJob === cron.id}
                      disabled={busyJob !== null && busyJob !== cron.id}
                      onClick={() => void triggerJob(cron.id)}
                    >
                      Run now
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Supplier health & balance trend */}
          <Card
            title="Supplier health & balance trend"
            action={
              <Link
                href={`${ROUTES.platform.catalog}?section=suppliers&panel=health`}
                className="text-xs text-rose hover:underline"
              >
                Open supplier catalog
              </Link>
            }
          >
            {data.suppliers.length === 0 ? (
              <EmptyState
                title="No suppliers connected"
                message="Connect a supplier in Catalog to monitor sync cadence and USDT balance."
              />
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-ink-faint">{data.migrationNote}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {data.suppliers.map((supplier) => (
                    <article
                      key={supplier.supplierId}
                      className="rounded-lg border border-stroke bg-black/20 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{supplier.name}</p>
                          <p className="mt-0.5 font-num text-xs text-ink-faint">
                            Balance {supplier.balance} USDT · {supplier.inStock}/{supplier.products} in stock
                          </p>
                        </div>
                        <StatusPill tone={pillTone(supplier.tone)}>{supplier.statusLabel}</StatusPill>
                      </div>

                      <div className="mt-2 h-12 w-full">
                        <Sparkline
                          data={supplier.balanceTrend}
                          color={supplier.tone === 'fault' ? '#FF5A5F' : CHART_COLORS.amber}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
                        <span>
                          Last synced:{' '}
                          {supplier.lastSyncAt ? (
                            <RelativeTime value={supplier.lastSyncAt} />
                          ) : (
                            <span className="text-ink-soft">Never</span>
                          )}
                        </span>
                        <span>
                          Next sync: <NextScheduleTime value={supplier.nextSyncAt} />
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                        <span>
                          Error rate{' '}
                          <span className="font-num text-ink-soft">
                            {supplier.errorRate === null ? '—' : `${supplier.errorRate}%`}
                          </span>
                        </span>
                        <span>
                          Avg fulfillment{' '}
                          <span className="font-num text-ink-soft">
                            {supplier.averageMinutes === null ? '—' : `${supplier.averageMinutes} min`}
                          </span>
                        </span>
                        {supplier.snapshotCount <= 1 ? (
                          <span>Trend builds after next check</span>
                        ) : null}
                      </div>

                      {supplier.lastSyncError ? (
                        <p className="mt-2 rounded-md border border-[var(--fault-tint)] bg-[var(--fault-tint)] px-2.5 py-1.5 text-xs text-[var(--fault-ink)]">
                          {supplier.lastSyncError}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Active job queue & failed jobs */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title={`Active job queue (${data.jobQueue.length})`}
              action={
                <Link href={ROUTES.platform.orders} className="text-xs text-rose hover:underline">
                  View orders
                </Link>
              }
            >
              {data.jobQueue.length === 0 ? (
                <EmptyState
                  title="Queue is clear"
                  message="No paid orders or scheduled broadcasts are waiting right now."
                />
              ) : (
                <ul className="space-y-2">
                  {data.jobQueue.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={job.href}
                        className="flex items-start justify-between gap-3 rounded-lg border border-stroke bg-black/20 px-3 py-2.5 transition hover:bg-white/[0.04]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-ink">{job.target}</p>
                          <p className="mt-0.5 truncate text-xs text-ink-faint">
                            {job.kind} · {job.storeName} · {job.detail}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusPill tone={pillTone(job.tone)}>{job.statusLabel}</StatusPill>
                          <span className="text-[11px] text-ink-faint">
                            <RelativeTime value={job.at} />
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title={`Failed jobs (${data.failedJobs.length})`}
              action={
                <Link href={`${ROUTES.platform.orders}?chip=attention`} className="text-xs text-rose hover:underline">
                  Review failures
                </Link>
              }
            >
              {data.failedJobs.length === 0 ? (
                <EmptyState
                  title="No failed jobs"
                  message="Fulfillments, supplier syncs, and broadcasts have zero open failures."
                />
              ) : (
                <ul className="space-y-2">
                  {data.failedJobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={job.href}
                        className="block rounded-lg border border-stroke bg-black/20 px-3 py-2.5 transition hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm text-ink">{job.target}</p>
                          <span className="shrink-0 text-[11px] text-ink-faint">
                            <RelativeTime value={job.at} />
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--fault-ink)]">
                          {job.kind}: {job.reason}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Bot webhook health */}
          <Card
            title="Bot webhook health"
            action={
              <Link href={ROUTES.platform.bots} className="text-xs text-rose hover:underline">
                Manage bots
              </Link>
            }
          >
            {data.bots.length === 0 ? (
              <EmptyState title="No bots registered" message="Connect the owner store bot in Bots." />
            ) : (
              <ul className="grid gap-2.5 md:grid-cols-2">
                {data.bots.map((bot) => (
                  <li
                    key={bot.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-stroke bg-black/20 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {bot.username} · <span className="font-normal text-ink-soft">{bot.storeName}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {bot.roleLabel}
                        {bot.lastHealthAt ? (
                          <>
                            {' '}· Checked <RelativeTime value={bot.lastHealthAt} />
                          </>
                        ) : null}
                      </p>
                      {bot.detail ? <p className="mt-1 text-xs text-ink-soft">{bot.detail}</p> : null}
                    </div>
                    <StatusPill tone={pillTone(bot.tone)}>{bot.stateLabel}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Error log */}
          <Card title="Recent error log">
            {data.errorLog.length === 0 ? (
              <EmptyState
                title="No recent errors"
                message="Fulfillment, supplier, support, and guard events will show up here if an error occurs."
              />
            ) : (
              <ul className="space-y-2">
                {data.errorLog.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stroke bg-black/20 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone="fault">{entry.category}</StatusPill>
                        <p className="truncate text-sm text-ink">{entry.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">{entry.message}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-ink-faint">
                      <RelativeTime value={entry.at} />
                      {entry.href ? (
                        <Link href={entry.href} className="text-rose hover:underline">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Launch readiness checklist */}
          <Card
            title="Launch checklist"
            action={
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                <CheckCircle2 className="h-3.5 w-3.5 text-mint" aria-hidden="true" />
                {data.summary.launchPassing} passing · Secret values stay on the server
              </span>
            }
          >
            <div className="space-y-4">
              {CHECKLIST_GROUPS.map((group) => {
                const rows = data.launchChecklist.filter((item) => item.group === group.id);
                if (rows.length === 0) return null;
                return (
                  <div key={group.id} className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
                      {group.label}
                    </h3>
                    <ul className="space-y-2">
                      {rows.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke bg-black/20 px-3.5 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-ink">{item.label}</p>
                            <p className="mt-0.5 text-xs text-ink-faint">{item.detail}</p>
                          </div>
                          <StatusPill tone={item.passing ? 'ok' : 'fault'}>
                            {item.passing ? 'Passing' : 'Needs attention'}
                          </StatusPill>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      ) : null}
    </section>
  );
}
