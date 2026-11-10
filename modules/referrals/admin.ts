import { AppError, ValidationError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { isAllowedBotUrl } from '@/modules/store-config/urls';
import { getStoreConfig, saveStoreConfig } from '@/modules/store-config';
import type { ReferralConfig, StoredStoreConfig } from '@/modules/store-config/types';
import { appendPoints, pointsBalance } from '@/modules/referrals/store';
import {
  AdjustPointsSchema,
  FreebiePatchSchema,
  FreebieSchema,
  GrowthSettingsSchema,
  RejectReferralSchema,
} from '@/lib/validations/growth';

type ReferralRow = {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly referrer_customer_id: string;
  readonly referred_customer_id: string;
  readonly status: string;
  readonly reject_reason: string | null;
  readonly created_at: string;
  readonly qualified_at: string | null;
};

type CustomerRow = {
  readonly id: string;
  readonly bot_id: string | null;
  readonly first_name: string | null;
};

const PAGE_CAP = 1000;

function sameStore(rowTenant: string | null, tenantId: string | null): boolean {
  return (rowTenant ?? null) === tenantId;
}

async function audit(
  supabase: DbClient,
  actorId: string,
  action: string,
  targetId: string,
  reason: string,
  after: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: actorId,
    action,
    target_type: 'referral',
    target_id: targetId,
    after_val: after,
    reason,
  });
  if (error) {
    throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
  }
}

async function storeReferrals(supabase: DbClient, tenantId: string | null): Promise<ReferralRow[]> {
  let query = supabase.from('referrals').select('*');
  query = tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId);
  const result = (await query) as QueryResult<ReferralRow[]>;
  if (result.error) {
    throw new AppError('REFERRAL_READ_FAILED', result.error.message, 500);
  }
  return (result.data ?? []).slice(0, PAGE_CAP);
}

async function namesFor(supabase: DbClient, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const names = new Map<string, string>();
  if (unique.length === 0) {
    return names;
  }
  const result = (await supabase.from('customers').select('id, first_name').in('id', unique)) as QueryResult<
    Array<{ id: string; first_name: string | null }>
  >;
  for (const row of result.data ?? []) {
    const name = row.first_name?.trim();
    if (name) {
      names.set(row.id, name);
    }
  }
  return names;
}

export async function growthOverview(supabase: DbClient, tenantId: string | null): Promise<{
  readonly settings: StoredStoreConfig;
  readonly totals: { readonly invited: number; readonly pending: number; readonly qualified: number; readonly rejected: number };
  readonly topReferrers: ReadonlyArray<{ readonly customerId: string; readonly name: string; readonly qualified: number }>;
}> {
  const settings = await getStoreConfig(supabase, tenantId);
  const rows = await storeReferrals(supabase, tenantId);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === 'qualified') {
      counts.set(row.referrer_customer_id, (counts.get(row.referrer_customer_id) ?? 0) + 1);
    }
  }
  const topIds = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const names = await namesFor(supabase, topIds.map((entry) => entry[0]));
  return {
    settings,
    totals: {
      invited: rows.length,
      pending: rows.filter((row) => row.status === 'pending').length,
      qualified: rows.filter((row) => row.status === 'qualified').length,
      rejected: rows.filter((row) => row.status === 'rejected').length,
    },
    topReferrers: topIds.map(([customerId, qualified]) => ({
      customerId,
      name: names.get(customerId) ?? 'Friend',
      qualified,
    })),
  };
}

export async function saveGrowthSettings(
  supabase: DbClient,
  tenantId: string | null,
  actorId: string,
  input: unknown,
  expectedVersion: number,
): Promise<StoredStoreConfig> {
  const parsed = GrowthSettingsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_GROWTH_SETTINGS', parsed.error.issues[0]?.message ?? 'Check the growth settings');
  }
  const current = await getStoreConfig(supabase, tenantId);
  const next = { ...current.config, referrals: parsed.data satisfies ReferralConfig };
  return saveStoreConfig(supabase, tenantId, next, actorId, expectedVersion);
}

export async function listGrowthReferrals(
  supabase: DbClient,
  tenantId: string | null,
  status: 'all' | 'pending' | 'qualified' | 'rejected',
  page: number,
  pageSize: number,
): Promise<{ readonly total: number; readonly rows: ReadonlyArray<Record<string, string | null>> }> {
  const filtered = (await storeReferrals(supabase, tenantId))
    .filter((row) => status === 'all' || row.status === status)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
  const names = await namesFor(
    supabase,
    slice.flatMap((row) => [row.referrer_customer_id, row.referred_customer_id]),
  );
  return {
    total: filtered.length,
    rows: slice.map((row) => ({
      id: row.id,
      status: row.status,
      referrerId: row.referrer_customer_id,
      referrerName: names.get(row.referrer_customer_id) ?? 'Friend',
      referredId: row.referred_customer_id,
      referredName: names.get(row.referred_customer_id) ?? 'Friend',
      reason: row.reject_reason,
      createdAt: row.created_at,
      qualifiedAt: row.qualified_at,
    })),
  };
}

export async function rejectReferral(
  supabase: DbClient,
  tenantId: string | null,
  actorId: string,
  input: unknown,
): Promise<void> {
  const parsed = RejectReferralSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REFERRAL', parsed.error.issues[0]?.message ?? 'Check the referral');
  }
  const found = (await supabase.from('referrals').select('*').eq('id', parsed.data.referralId).maybeSingle()) as QueryResult<
    ReferralRow | null
  >;
  const row = found.data;
  if (found.error || !row || !sameStore(row.tenant_id, tenantId)) {
    throw new AppError('REFERRAL_NOT_FOUND', 'Referral not found', 404);
  }
  if (row.status !== 'pending') {
    throw new ValidationError('REFERRAL_NOT_PENDING', 'Only a pending referral can be rejected.');
  }
  const updated = await supabase
    .from('referrals')
    .update({ status: 'rejected', reject_reason: parsed.data.reason })
    .eq('id', row.id)
    .eq('status', 'pending');
  if (updated.error) {
    throw new AppError('REFERRAL_REJECT_FAILED', updated.error.message, 500);
  }
  await audit(supabase, actorId, 'referral.reject', row.id, parsed.data.reason, { status: 'rejected' });
}

async function customerInStore(supabase: DbClient, tenantId: string | null, customerId: string): Promise<CustomerRow> {
  const found = (await supabase.from('customers').select('id, bot_id, first_name').eq('id', customerId).maybeSingle()) as QueryResult<
    CustomerRow | null
  >;
  const customer = found.data;
  if (found.error || !customer) {
    throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
  }
  if (tenantId === null) {
    if (customer.bot_id !== null) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    }
    return customer;
  }
  const bots = (await supabase.from('bot_connections').select('id').eq('tenant_id', tenantId)) as QueryResult<Array<{ id: string }>>;
  const owned = (bots.data ?? []).some((bot) => bot.id === customer.bot_id);
  if (!owned) {
    throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
  }
  return customer;
}

export async function adjustCustomerPoints(
  supabase: DbClient,
  tenantId: string | null,
  actorId: string,
  input: unknown,
): Promise<{ readonly balance: number; readonly created: boolean }> {
  const parsed = AdjustPointsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_POINTS', parsed.error.issues[0]?.message ?? 'Check the point change');
  }
  await customerInStore(supabase, tenantId, parsed.data.customerId);
  const current = await pointsBalance(supabase, parsed.data.customerId);
  if (current + parsed.data.delta < 0) {
    throw new ValidationError('POINTS_BELOW_ZERO', 'This would take the point balance below zero.');
  }
  const written = await appendPoints(supabase, {
    customerId: parsed.data.customerId,
    tenantId,
    delta: parsed.data.delta,
    reason: 'admin_adjust',
    reference: parsed.data.requestId,
    note: parsed.data.reason,
  });
  if (written.created) {
    await audit(supabase, actorId, 'points.adjust', parsed.data.customerId, parsed.data.reason, {
      delta: parsed.data.delta,
      requestId: parsed.data.requestId,
    });
  }
  return { balance: await pointsBalance(supabase, parsed.data.customerId), created: written.created };
}

type FreebieRow = {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly kind: string;
  readonly content: string;
  readonly required_referrals: number | string;
  readonly active: boolean | string;
  readonly sort_order: number | string | null;
};

function assertLink(kind: string, content: string): void {
  if (kind === 'link' && !isAllowedBotUrl(content)) {
    throw new ValidationError('INVALID_FREEBIE', 'A link freebie needs an https:// or t.me address.');
  }
}

async function freebieRows(supabase: DbClient, tenantId: string | null): Promise<FreebieRow[]> {
  let query = supabase.from('freebies').select('*');
  query = tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId);
  const result = (await query) as QueryResult<FreebieRow[]>;
  if (result.error) {
    throw new AppError('FREEBIE_READ_FAILED', result.error.message, 500);
  }
  return result.data ?? [];
}

export async function listGrowthFreebies(
  supabase: DbClient,
  tenantId: string | null,
): Promise<ReadonlyArray<Record<string, string | number | boolean | null>>> {
  const rows = await freebieRows(supabase, tenantId);
  const claims = (await supabase.from('freebie_claims').select('freebie_id')) as QueryResult<Array<{ freebie_id: string }>>;
  const counts = new Map<string, number>();
  for (const claim of claims.data ?? []) {
    counts.set(claim.freebie_id, (counts.get(claim.freebie_id) ?? 0) + 1);
  }
  return rows
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      kind: row.kind,
      content: row.content,
      requiredReferrals: Number(row.required_referrals),
      active: row.active === true || row.active === 'true',
      sortOrder: Number(row.sort_order ?? 0),
      claims: counts.get(row.id) ?? 0,
    }));
}

export async function createFreebie(supabase: DbClient, tenantId: string | null, actorId: string, input: unknown): Promise<void> {
  const parsed = FreebieSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_FREEBIE', parsed.error.issues[0]?.message ?? 'Check the freebie');
  }
  assertLink(parsed.data.kind, parsed.data.content);
  const existing = await freebieRows(supabase, tenantId);
  const inserted = (await supabase.from('freebies').insert({
    tenant_id: tenantId,
    title: parsed.data.title,
    description: parsed.data.description,
    kind: parsed.data.kind,
    content: parsed.data.content,
    required_referrals: parsed.data.requiredReferrals,
    active: parsed.data.active,
    sort_order: existing.length,
  })) as QueryResult<Array<{ id: string }>>;
  const created = inserted.data?.[0];
  if (inserted.error || !created) {
    throw new AppError('FREEBIE_SAVE_FAILED', inserted.error?.message ?? 'Unable to save the freebie', 500);
  }
  await audit(supabase, actorId, 'freebie.create', created.id, parsed.data.title, { title: parsed.data.title });
}

export async function updateFreebie(
  supabase: DbClient,
  tenantId: string | null,
  actorId: string,
  freebieId: string,
  input: unknown,
): Promise<void> {
  const parsed = FreebiePatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_FREEBIE', parsed.error.issues[0]?.message ?? 'Check the freebie');
  }
  const rows = await freebieRows(supabase, tenantId);
  const current = rows.find((row) => row.id === freebieId);
  if (!current) {
    throw new AppError('FREEBIE_NOT_FOUND', 'Freebie not found', 404);
  }
  const kind = parsed.data.kind ?? (current.kind === 'link' ? 'link' : 'text');
  const content = parsed.data.content ?? current.content;
  assertLink(kind, content);
  const updated = await supabase
    .from('freebies')
    .update({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
      ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
      ...(parsed.data.requiredReferrals !== undefined ? { required_referrals: parsed.data.requiredReferrals } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sort_order: parsed.data.sortOrder } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', freebieId);
  if (updated.error) {
    throw new AppError('FREEBIE_SAVE_FAILED', updated.error.message, 500);
  }
  await audit(supabase, actorId, 'freebie.update', freebieId, 'freebie updated', { active: parsed.data.active ?? null });
}
