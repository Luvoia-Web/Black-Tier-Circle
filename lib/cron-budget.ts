/**
 * @file lib/cron-budget.ts
 *
 * Shared time-budget and batch-size bounds so every cron route finishes well
 * under external cron provider timeouts (e.g. cron-job.org's 30 s hard limit).
 */

export const CRON_TIME_BUDGET_MS = 20_000;

export const CRON_BATCH_LIMITS = {
  supplierSyncMaxSuppliers: 1,
  supplierSyncMaxUpdates: 500,
  fulfillmentQueuedOrders: 10,
  fulfillmentReadyOrders: 10,
  reconcileUnknownOrders: 15,
  reconcilePollOrders: 15,
  reconcilePiggybackSuppliers: 1,
  reconcilePiggybackMinRemainingMs: 8_000,
  botHealthChecks: 15,
  broadcastJobs: 1,
  broadcastRecipients: 150,
} as const;

export type CronBudget = {
  readonly startedAt: number;
  readonly budgetMs: number;
  readonly deadlineMs: number;
  readonly elapsedMs: () => number;
  readonly remainingMs: () => number;
  readonly hasTime: (reserveMs?: number) => boolean;
};

export function createCronBudget(
  budgetMs: number = CRON_TIME_BUDGET_MS,
  nowFn: () => number = Date.now,
): CronBudget {
  const safeBudget = Math.max(0, budgetMs);
  const startedAt = nowFn();
  const deadlineMs = startedAt + safeBudget;
  return {
    startedAt,
    budgetMs: safeBudget,
    deadlineMs,
    elapsedMs: () => Math.max(0, nowFn() - startedAt),
    remainingMs: () => Math.max(0, deadlineMs - nowFn()),
    hasTime: (reserveMs = 0) => nowFn() + Math.max(0, reserveMs) < deadlineMs,
  };
}
