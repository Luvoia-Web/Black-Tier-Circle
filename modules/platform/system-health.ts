/**
 * @file modules/platform/system-health.ts
 *
 * Aggregates operational health telemetry for the owner System health dashboard:
 * suppliers (balance trend, last & next sync), Telegram bots, cron schedules
 * (last & next run), active job queue, failed jobs, error log, and launch checklist.
 */

import {
  displayAuditAction,
  displayOrderEventNote,
  formatPlainDatesInText,
} from '@/lib/display-labels';
import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import { ownerBotDisplayName, resolveBotLiveStatus } from '@/lib/owner-bot';
import {
  isOrderCanceled,
  isOrderDelivered,
  isOrderFailed,
  orderDisplayStatus,
} from '@/lib/order-state';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { evaluateLaunchChecklist, type LaunchCheck } from '@/modules/launch';
import {
  BOT_TOKEN_DECRYPT_ERROR_MESSAGE,
  getPlatformSettings,
  readOwnerBotPaused,
  readOwnerBotTokenState,
} from '@/modules/platform';
import { readSupplierDesk } from '@/modules/platform/supplier-desk';

export type HealthTone = 'ok' | 'warn' | 'fault' | 'neutral' | 'info';

export type SystemHealthSummary = {
  readonly launchPassing: string;
  readonly launchAllPassing: boolean;
  readonly suppliersHealthy: string;
  readonly totalSupplierBalance: string;
  readonly botsHealthy: string;
  readonly activeJobs: number;
  readonly failedJobs: number;
};

export type SystemHealthSupplierRow = {
  readonly supplierId: string;
  readonly name: string;
  readonly statusLabel: string;
  readonly tone: HealthTone;
  readonly balance: string;
  readonly products: number;
  readonly inStock: number;
  readonly errorRate: number | null;
  readonly averageMinutes: number | null;
  readonly lastSyncAt: string | null;
  readonly nextSyncAt: string;
  readonly syncOverdue: boolean;
  readonly lastSyncError: string | null;
  readonly balanceTrend: readonly number[];
  readonly snapshotCount: number;
};

export type SystemHealthBotRow = {
  readonly id: string;
  readonly username: string;
  readonly storeName: string;
  readonly roleLabel: 'Owner bot' | 'Reseller bot';
  readonly stateLabel: string;
  readonly tone: HealthTone;
  readonly lastHealthAt: string | null;
  readonly detail: string | null;
};

export type SystemHealthCronJobId =
  | 'fulfillment'
  | 'supplier_reconcile'
  | 'supplier_sync'
  | 'bot_health'
  | 'broadcasts';

export type SystemHealthCronRow = {
  readonly id: SystemHealthCronJobId;
  readonly label: string;
  readonly cadenceLabel: string;
  readonly intervalMinutes: number;
  readonly lastRunAt: string | null;
  readonly nextRunAt: string;
  readonly overdue: boolean;
  readonly statusLabel: string;
  readonly tone: HealthTone;
  readonly detail: string;
};

export type SystemHealthJobRow = {
  readonly id: string;
  readonly kind: 'Order fulfillment' | 'Scheduled broadcast';
  readonly target: string;
  readonly statusLabel: string;
  readonly tone: HealthTone;
  readonly storeName: string;
  readonly detail: string;
  readonly at: string;
  readonly href: string;
};

export type SystemHealthFailedJobRow = {
  readonly id: string;
  readonly kind: 'Order fulfillment' | 'Supplier sync' | 'Broadcast';
  readonly target: string;
  readonly reason: string;
  readonly at: string;
  readonly href: string;
};

export type SystemHealthErrorRow = {
  readonly id: string;
  readonly category: 'Fulfillment' | 'Supplier' | 'Security' | 'Support';
  readonly title: string;
  readonly message: string;
  readonly at: string;
  readonly href?: string;
};

export type SystemHealthPayload = {
  readonly generatedAt: string;
  readonly summary: SystemHealthSummary;
  readonly crons: readonly SystemHealthCronRow[];
  readonly suppliers: readonly SystemHealthSupplierRow[];
  readonly bots: readonly SystemHealthBotRow[];
  readonly jobQueue: readonly SystemHealthJobRow[];
  readonly failedJobs: readonly SystemHealthFailedJobRow[];
  readonly errorLog: readonly SystemHealthErrorRow[];
  readonly launchChecklist: readonly LaunchCheck[];
  readonly migrationNote: string;
};

const SUPPLIER_SYNC_TICK_MINUTES = 10;

const ERROR_AUDIT_ACTIONS = [
  'support_reply_failed',
  'claim.failed',
  'fraud.blocked',
  'fraud.order_refused',
  'fraud.freebie_refused',
  'fraud.discount_refused',
  'fraud.claim_refused',
  'fraud.support_refused',
  'fraud.referral_refused',
] as const;

const CRON_ACTIONS = [
  'cron.fulfillment',
  'cron.supplier_reconcile',
  'cron.supplier_sync',
  'cron.bot_health',
  'cron.broadcasts',
] as const;

function records(result: QueryResult<unknown>, code: string): Record<string, unknown>[] {
  if (result.error) {
    throw new AppError(code, result.error.message, 500);
  }
  if (!Array.isArray(result.data)) return [];
  return result.data.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sanitizeCopy(raw: string | null | undefined, fallback = ''): string {
  if (!raw) return fallback;
  const noted = displayOrderEventNote(raw) ?? raw;
  const cleaned = formatPlainDatesInText(noted).trim();
  return cleaned || fallback;
}

function maxIso(...candidates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ms = Date.parse(candidate);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      best = new Date(ms).toISOString();
    }
  }
  return best;
}

function cronSpecFor(
  id: SystemHealthCronJobId,
  label: string,
  cadenceLabel: string,
  intervalMinutes: number,
  lastRunAt: string | null,
  now: Date,
  detail: string,
): SystemHealthCronRow {
  const intervalMs = intervalMinutes * 60 * 1000;
  const lastMs = lastRunAt ? Date.parse(lastRunAt) : NaN;
  const hasValidLast = Number.isFinite(lastMs);
  const nextMs = hasValidLast ? Math.max(now.getTime(), lastMs + intervalMs) : now.getTime();
  const overdue = !hasValidLast || now.getTime() - lastMs > intervalMs * 2.5;
  return {
    id,
    label,
    cadenceLabel,
    intervalMinutes,
    lastRunAt,
    nextRunAt: new Date(nextMs).toISOString(),
    overdue,
    statusLabel: !hasValidLast ? 'Not recorded yet' : overdue ? 'Overdue' : 'On schedule',
    tone: !hasValidLast ? 'warn' : overdue ? 'warn' : 'ok',
    detail: sanitizeCopy(detail, cadenceLabel),
  };
}

function describeAfterVal(action: string, afterVal: unknown): string {
  if (!afterVal || typeof afterVal !== 'object') {
    return '';
  }
  const obj = afterVal as Record<string, unknown>;
  if (action === 'cron.fulfillment') {
    const processed = Number(obj.processed ?? 0);
    const failed = Number(obj.failed ?? 0);
    return `${processed} processed${failed > 0 ? `, ${failed} failed` : ''}`;
  }
  if (action === 'cron.supplier_reconcile') {
    const reconciled = Number(obj.reconciled ?? 0);
    const polled = Number(obj.polled ?? 0);
    return `${reconciled} reconciled, ${polled} polled`;
  }
  if (action === 'cron.supplier_sync') {
    const supplierName = typeof obj.supplierName === 'string' && obj.supplierName.trim() ? obj.supplierName.trim() : null;
    const durationMs = typeof obj.durationMs === 'number' && Number.isFinite(obj.durationMs) ? obj.durationMs : null;
    const suppliers = Number(obj.suppliers ?? 0);
    const ok = Number(obj.ok ?? 0);
    const failed = Number(obj.failed ?? 0);
    if (supplierName) {
      const dur = durationMs !== null ? ` (${(durationMs / 1000).toFixed(1)}s)` : '';
      return failed > 0 ? `${supplierName} failed${dur}` : `${supplierName} synced${dur}`;
    }
    return `${ok}/${suppliers} suppliers synced${failed > 0 ? `, ${failed} failed` : ''}`;
  }
  if (action === 'cron.bot_health') {
    const checked = Number(obj.checked ?? 0);
    const errors = Number(obj.errors ?? 0);
    return `${checked} bots checked${errors > 0 ? `, ${errors} errors` : ''}`;
  }
  if (action === 'cron.broadcasts') {
    const processed = Number(obj.processed ?? 0);
    return `${processed} scheduled broadcast${processed === 1 ? '' : 's'} processed`;
  }
  return '';
}

function minorAmount(value: unknown): string {
  try {
    const minor = BigInt(typeof value === 'string' || typeof value === 'number' ? value : 0);
    return formatUsdt(minor);
  } catch {
    return '0.00 USDT';
  }
}

export async function readSystemHealth(
  db: DbClient,
  now: Date = new Date(),
): Promise<SystemHealthPayload> {
  const [
    desk,
    checklist,
    settings,
    ownerPaused,
    ownerTokenState,
    supplierMetaRes,
    supplierProductsRes,
    resellerBotsRes,
    tenantsRes,
    attemptsRes,
    ordersRes,
    cronLogsRes,
    errorAuditRes,
    broadcastsRes,
  ] = await Promise.all([
    readSupplierDesk(db),
    evaluateLaunchChecklist(db),
    getPlatformSettings(db),
    readOwnerBotPaused(db),
    readOwnerBotTokenState(db),
    db.from('suppliers').select('id, product_count').limit(100),
    db.from('supplier_products').select('supplier_id, in_stock').limit(5000),
    db
      .from('bot_connections')
      .select('id, tenant_id, username, status, last_health_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200),
    db.from('tenants').select('id, business_name, display_name').limit(500),
    db
      .from('fulfillment_attempts')
      .select('id, order_id, method, status, error, started_at, completed_at')
      .order('started_at', { ascending: false })
      .limit(250),
    db
      .from('orders')
      .select('id, tenant_id, product_id, payment_status, fulfillment_status, delivery_status, quoted_retail_price, quantity, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(400),
    db
      .from('audit_log')
      .select('action, reason, after_val, created_at')
      .in('action', [...CRON_ACTIONS])
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('audit_log')
      .select('id, action, reason, target_id, created_at')
      .in('action', [...ERROR_AUDIT_ACTIONS])
      .order('created_at', { ascending: false })
      .limit(30),
    db
      .from('broadcasts')
      .select('id, tenant_id, body, audience, status, scheduled_for, recipients, sent, failed, created_at, updated_at')
      .in('status', ['scheduled', 'sending', 'failed'])
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const tenantNames = new Map<string, string>();
  for (const row of records(tenantsRes as QueryResult<unknown>, 'SYSTEM_HEALTH_TENANTS_FAILED')) {
    const name = sanitizeCopy(str(row.business_name) || str(row.display_name), 'Reseller store');
    tenantNames.set(str(row.id), name);
  }

  // Supplier product counts
  const declaredProductCount = new Map<string, number>();
  for (const row of records(supplierMetaRes as QueryResult<unknown>, 'SYSTEM_HEALTH_SUPPLIERS_FAILED')) {
    declaredProductCount.set(str(row.id), Number(row.product_count ?? 0) || 0);
  }
  const countsBySupplier = new Map<string, { total: number; inStock: number }>();
  for (const row of records(supplierProductsRes as QueryResult<unknown>, 'SYSTEM_HEALTH_SUPPLIER_PRODUCTS_FAILED')) {
    const sid = str(row.supplier_id);
    if (!sid) continue;
    const slot = countsBySupplier.get(sid) ?? { total: 0, inStock: 0 };
    slot.total += 1;
    if (row.in_stock === true) slot.inStock += 1;
    countsBySupplier.set(sid, slot);
  }

  const activeSupplierCount = desk.health.filter(
    (row) => row.status === 'active' || row.status === 'connected',
  ).length;
  const supplierCycleMinutes = Math.max(1, activeSupplierCount) * SUPPLIER_SYNC_TICK_MINUTES;
  const supplierIntervalMs = supplierCycleMinutes * 60 * 1000;
  const supplierOverdueMs = Math.max(25, Math.ceil(supplierCycleMinutes * 1.5)) * 60 * 1000;

  let totalBalance = 0;
  let healthySuppliers = 0;
  const suppliers: SystemHealthSupplierRow[] = desk.health.map((row) => {
    const balNum = Number.parseFloat(row.balance);
    const numericBalance = Number.isFinite(balNum) ? balNum : 0;
    totalBalance += numericBalance;
    const counts = countsBySupplier.get(row.supplierId);
    const totalProducts = counts?.total || declaredProductCount.get(row.supplierId) || 0;
    const inStock = counts?.inStock ?? 0;

    const lastMs = row.lastSyncAt ? Date.parse(row.lastSyncAt) : NaN;
    const hasLast = Number.isFinite(lastMs);
    const nextSyncMs = hasLast ? Math.max(now.getTime(), lastMs + supplierIntervalMs) : now.getTime();
    const syncOverdue = !hasLast || now.getTime() - lastMs > supplierOverdueMs;
    const cleanError = row.lastSyncError ? sanitizeCopy(row.lastSyncError) : null;
    const isActive = row.status === 'active' || row.status === 'connected';
    const isHealthy = isActive && !cleanError && !syncOverdue;
    if (isHealthy) healthySuppliers += 1;

    let statusLabel = 'Needs attention';
    let tone: HealthTone = 'warn';
    if (cleanError) {
      statusLabel = 'Sync error';
      tone = 'fault';
    } else if (!isActive) {
      statusLabel = sanitizeCopy(row.status, 'Paused');
      tone = 'warn';
    } else if (syncOverdue) {
      statusLabel = hasLast ? 'Sync overdue' : 'Never synced';
      tone = 'warn';
    } else {
      statusLabel = 'Healthy';
      tone = 'ok';
    }

    const trend =
      row.balanceTrend.length >= 2
        ? row.balanceTrend
        : [numericBalance, numericBalance];

    return {
      supplierId: row.supplierId,
      name: sanitizeCopy(row.name, 'Supplier'),
      statusLabel,
      tone,
      balance: numericBalance.toFixed(2),
      products: totalProducts,
      inStock,
      errorRate: row.errorRate,
      averageMinutes: row.averageMinutes,
      lastSyncAt: row.lastSyncAt,
      nextSyncAt: new Date(nextSyncMs).toISOString(),
      syncOverdue,
      lastSyncError: cleanError,
      balanceTrend: trend,
      snapshotCount: row.balanceTrend.length,
    };
  });

  // Orders (loaded before Bots so we can compute 24h bot activity)
  const orders = records(ordersRes as QueryResult<unknown>, 'SYSTEM_HEALTH_ORDERS_FAILED');

  // Bots
  const bots: SystemHealthBotRow[] = [];
  const ownerOrderLatest = maxIso(
    ...orders
      .filter((row) => !row.tenant_id && str(row.channel) !== 'reseller_bot')
      .map((row) => str(row.created_at) || null),
  );
  const ownerLive = resolveBotLiveStatus({
    storedStatus: settings.ownerBotStatus,
    paused: ownerPaused,
    decryptFailed: ownerTokenState.status === 'decrypt_failed',
    lastUpdateAt: ownerOrderLatest,
    now,
    decryptErrorMessage: BOT_TOKEN_DECRYPT_ERROR_MESSAGE,
  });
  bots.push({
    id: 'owner',
    username: ownerBotDisplayName(settings.ownerBotUsername),
    storeName: sanitizeCopy(settings.platformName, 'Black Tier Circle'),
    roleLabel: 'Owner bot',
    stateLabel: ownerLive.status,
    tone: ownerLive.tone,
    lastHealthAt: settings.ownerBotLastHealthAt ? settings.ownerBotLastHealthAt.toISOString() : null,
    detail: ownerLive.detail,
  });

  let resellerLastHealth: string | null = null;
  for (const row of records(resellerBotsRes as QueryResult<unknown>, 'SYSTEM_HEALTH_BOTS_FAILED')) {
    const status = str(row.status);
    const lastHealthAt = str(row.last_health_at) || null;
    resellerLastHealth = maxIso(resellerLastHealth, lastHealthAt);
    const usernameRaw = str(row.username);
    const tenantIdRow = str(row.tenant_id);
    const botOrderLatest = maxIso(
      ...orders
        .filter((o) => str(o.tenant_id) === tenantIdRow)
        .map((o) => str(o.created_at) || null),
    );
    const botLive = resolveBotLiveStatus({
      storedStatus: status,
      paused: status === 'paused',
      lastUpdateAt: botOrderLatest,
      now,
    });
    bots.push({
      id: str(row.id),
      username: usernameRaw ? `@${usernameRaw.replace(/^@/, '')}` : 'Reseller bot',
      storeName: tenantNames.get(tenantIdRow) ?? 'Reseller store',
      roleLabel: 'Reseller bot',
      stateLabel: botLive.status,
      tone: botLive.tone,
      lastHealthAt,
      detail: botLive.detail,
    });
  }
  const healthyBots = bots.filter((b) => b.stateLabel === 'Online' || b.stateLabel === 'Idle').length;

  // Cron heartbeats + domain fallbacks
  const attempts = records(attemptsRes as QueryResult<unknown>, 'SYSTEM_HEALTH_ATTEMPTS_FAILED');
  const latestCronAudit = new Map<string, { at: string; summary: string }>();
  for (const row of records(cronLogsRes as QueryResult<unknown>, 'SYSTEM_HEALTH_CRON_LOG_FAILED')) {
    const action = str(row.action);
    if (!action || latestCronAudit.has(action)) continue;
    const summary = describeAfterVal(action, row.after_val) || sanitizeCopy(str(row.reason));
    latestCronAudit.set(action, { at: str(row.created_at), summary });
  }

  let latestAttemptStarted: string | null = null;
  let latestAttemptCompleted: string | null = null;
  const attemptErrorByOrder = new Map<string, string>();
  const failedAttemptErrors: SystemHealthErrorRow[] = [];

  for (const attempt of attempts) {
    const oid = str(attempt.order_id);
    const startedAt = str(attempt.started_at);
    const completedAt = str(attempt.completed_at);
    latestAttemptStarted = maxIso(latestAttemptStarted, startedAt);
    latestAttemptCompleted = maxIso(latestAttemptCompleted, completedAt);
    const errText = str(attempt.error);
    if (oid && errText && !attemptErrorByOrder.has(oid)) {
      attemptErrorByOrder.set(oid, errText);
    }
    if ((str(attempt.status) === 'failed' || errText) && failedAttemptErrors.length < 20) {
      failedAttemptErrors.push({
        id: `attempt-${str(attempt.id)}`,
        category: str(attempt.method) === 'supplier' ? 'Supplier' : 'Fulfillment',
        title: oid ? `Order ${oid.slice(0, 8).toUpperCase()}` : 'Fulfillment attempt',
        message: sanitizeCopy(errText, 'Fulfillment could not be completed.'),
        at: startedAt || completedAt || now.toISOString(),
        ...(oid ? { href: `/orders?search=${oid.slice(0, 8)}` } : {}),
      });
    }
  }

  const maxSupplierSyncAt = maxIso(...suppliers.map((s) => s.lastSyncAt));
  const fulfillmentLast = maxIso(latestCronAudit.get('cron.fulfillment')?.at, latestAttemptStarted);
  const reconcileLast = maxIso(latestCronAudit.get('cron.supplier_reconcile')?.at, latestAttemptCompleted);
  const supplierSyncLast = maxIso(latestCronAudit.get('cron.supplier_sync')?.at, maxSupplierSyncAt);
  const botHealthLast = maxIso(
    latestCronAudit.get('cron.bot_health')?.at,
    resellerLastHealth,
    settings.ownerBotLastHealthAt ? settings.ownerBotLastHealthAt.toISOString() : null,
  );

  const broadcastsLast = latestCronAudit.get('cron.broadcasts')?.at ?? null;

  const crons: SystemHealthCronRow[] = [
    cronSpecFor(
      'fulfillment',
      'Order fulfillment & expiry',
      'Every 2 minutes',
      2,
      fulfillmentLast,
      now,
      latestCronAudit.get('cron.fulfillment')?.summary || 'Processes queued orders and expires stale top-ups.',
    ),
    cronSpecFor(
      'supplier_reconcile',
      'Supplier order reconciliation',
      'Every 5 minutes',
      5,
      reconcileLast,
      now,
      latestCronAudit.get('cron.supplier_reconcile')?.summary || 'Polls pending supplier activations in bounded batches.',
    ),
    cronSpecFor(
      'supplier_sync',
      'Supplier catalog sync',
      `Every ${SUPPLIER_SYNC_TICK_MINUTES} minutes (1 supplier / call)`,
      SUPPLIER_SYNC_TICK_MINUTES,
      supplierSyncLast,
      now,
      latestCronAudit.get('cron.supplier_sync')?.summary || 'Rotates through suppliers oldest-first to refresh stock, prices, and balances.',
    ),
    cronSpecFor(
      'bot_health',
      'Bot webhook health',
      'Every 15 minutes',
      15,
      botHealthLast,
      now,
      latestCronAudit.get('cron.bot_health')?.summary || 'Verifies Telegram webhook connectivity across connected bots.',
    ),
    cronSpecFor(
      'broadcasts',
      'Scheduled broadcasts',
      'Every 5 minutes',
      5,
      broadcastsLast,
      now,
      latestCronAudit.get('cron.broadcasts')?.summary || 'Sends due scheduled buyer broadcasts within safe rate limits.',
    ),
  ];

  // Job queue & failed jobs from orders + optional broadcasts + supplier sync errors
  const productIds = [...new Set(orders.map((o) => str(o.product_id)).filter(Boolean))].slice(0, 120);
  const productTitles = new Map<string, string>();
  if (productIds.length > 0) {
    const prodRes = (await db.from('products').select('id, title').in('id', productIds)) as QueryResult<unknown>;
    for (const p of records(prodRes, 'SYSTEM_HEALTH_PRODUCTS_FAILED')) {
      productTitles.set(str(p.id), sanitizeCopy(str(p.title), 'Product'));
    }
  }

  const jobQueue: SystemHealthJobRow[] = [];
  const failedJobs: SystemHealthFailedJobRow[] = [];

  for (const row of orders) {
    const id = str(row.id);
    const paymentStatus = str(row.payment_status);
    const fulfillmentStatus = str(row.fulfillment_status);
    const deliveryStatus = str(row.delivery_status);
    const tracks = { paymentStatus, fulfillmentStatus, deliveryStatus };
    if (isOrderDelivered(tracks) || isOrderCanceled(tracks)) {
      continue;
    }
    const shortId = id.slice(0, 8).toUpperCase();
    const productTitle = productTitles.get(str(row.product_id)) ?? 'Digital order';
    const storeName = row.tenant_id
      ? (tenantNames.get(str(row.tenant_id)) ?? 'Reseller store')
      : 'Owner store';
    const qty = Number(row.quantity ?? 1) || 1;
    const at = str(row.updated_at) || str(row.created_at) || now.toISOString();

    if (isOrderFailed(tracks)) {
      const attemptErr = attemptErrorByOrder.get(id);
      failedJobs.push({
        id: `order-${id}`,
        kind: 'Order fulfillment',
        target: `${shortId} · ${productTitle}`,
        reason: sanitizeCopy(attemptErr, orderDisplayStatus(tracks).label),
        at,
        href: '/orders?chip=attention',
      });
      continue;
    }

    const inFlight =
      paymentStatus === 'verified' &&
      (['queued', 'processing', 'supplier_pending', 'outcome_unknown', 'manual_pending'].includes(
        fulfillmentStatus,
      ) ||
        ['queued', 'sending', 'retry_pending'].includes(deliveryStatus));

    if (inFlight) {
      const display = orderDisplayStatus(tracks);
      jobQueue.push({
        id: `order-${id}`,
        kind: 'Order fulfillment',
        target: `${shortId} · ${productTitle}`,
        statusLabel: display.label,
        tone: display.tone,
        storeName,
        detail: `${qty}x · ${minorAmount(row.quoted_retail_price)}`,
        at,
        href: `/orders?search=${shortId}`,
      });
    }
  }

  // Scheduled / sending / failed broadcasts (migration 0037 applied)
  const broadcasts = records(broadcastsRes as QueryResult<unknown>, 'SYSTEM_HEALTH_BROADCASTS_FAILED');
  for (const row of broadcasts) {
    const id = str(row.id);
    const status = str(row.status);
    const storeName = row.tenant_id
      ? (tenantNames.get(str(row.tenant_id)) ?? 'Reseller store')
      : 'Owner store';
    const preview = sanitizeCopy(str(row.body), 'Buyer broadcast').slice(0, 64);
    const recipients = Number(row.recipients ?? 0);
    const sent = Number(row.sent ?? 0);
    const failed = Number(row.failed ?? 0);
    if (status === 'failed') {
      failedJobs.push({
        id: `broadcast-${id}`,
        kind: 'Broadcast',
        target: preview,
        reason: `${failed} recipient deliveries failed (${sent} sent).`,
        at: str(row.updated_at) || str(row.created_at) || now.toISOString(),
        href: '/broadcasts',
      });
    } else {
      jobQueue.push({
        id: `broadcast-${id}`,
        kind: 'Scheduled broadcast',
        target: preview,
        statusLabel: status === 'sending' ? 'Sending' : 'Scheduled',
        tone: status === 'sending' ? 'info' : 'neutral',
        storeName,
        detail:
          status === 'sending'
            ? `${sent}/${recipients} delivered`
            : `${recipients || 'Targeted'} audience`,
        at: str(row.scheduled_for) || str(row.created_at) || now.toISOString(),
        href: '/broadcasts',
      });
    }
  }

  // Supplier sync errors in failedJobs + errorLog
  const errorLog: SystemHealthErrorRow[] = [...failedAttemptErrors];
  for (const sup of suppliers) {
    if (!sup.lastSyncError) continue;
    const at = sup.lastSyncAt || now.toISOString();
    failedJobs.push({
      id: `supplier-${sup.supplierId}`,
      kind: 'Supplier sync',
      target: sup.name,
      reason: sup.lastSyncError,
      at,
      href: '/catalog?section=suppliers&panel=health',
    });
    errorLog.push({
      id: `supplier-err-${sup.supplierId}`,
      category: 'Supplier',
      title: `${sup.name} catalog sync`,
      message: sup.lastSyncError,
      at,
      href: '/catalog?section=suppliers&panel=health',
    });
  }

  for (const audit of records(errorAuditRes as QueryResult<unknown>, 'SYSTEM_HEALTH_AUDIT_FAILED')) {
    const action = str(audit.action);
    const category: SystemHealthErrorRow['category'] = action.startsWith('fraud.')
      ? 'Security'
      : action === 'support_reply_failed'
        ? 'Support'
        : 'Fulfillment';
    errorLog.push({
      id: `audit-${str(audit.id)}`,
      category,
      title: displayAuditAction(action),
      message: sanitizeCopy(str(audit.reason), displayAuditAction(action)),
      at: str(audit.created_at) || now.toISOString(),
    });
  }

  errorLog.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  failedJobs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  jobQueue.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const sanitizedChecklist: LaunchCheck[] = checklist.map((item) => ({
    ...item,
    label: sanitizeCopy(item.label, item.label),
    detail: sanitizeCopy(item.detail, item.detail),
  }));
  const passingCount = sanitizedChecklist.filter((item) => item.passing).length;

  return {
    generatedAt: now.toISOString(),
    summary: {
      launchPassing: `${passingCount}/${sanitizedChecklist.length}`,
      launchAllPassing: passingCount === sanitizedChecklist.length,
      suppliersHealthy: `${healthySuppliers}/${suppliers.length}`,
      totalSupplierBalance: totalBalance.toFixed(2),
      botsHealthy: `${healthyBots}/${bots.length}`,
      activeJobs: jobQueue.length,
      failedJobs: failedJobs.length,
    },
    crons,
    suppliers,
    bots,
    jobQueue: jobQueue.slice(0, 30),
    failedJobs: failedJobs.slice(0, 30),
    errorLog: errorLog.slice(0, 25),
    launchChecklist: sanitizedChecklist,
    migrationNote: desk.note,
  };
}
