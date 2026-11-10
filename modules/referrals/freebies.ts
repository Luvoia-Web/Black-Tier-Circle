import { AppError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { referralSummary } from '@/modules/referrals/store';

export type FreebieRecord = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'text' | 'link';
  readonly content: string;
  readonly required: number;
  readonly unlocked: boolean;
  readonly claimed: boolean;
};

type FreebieRow = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly kind: string;
  readonly content: string;
  readonly required_referrals: number | string;
  readonly active: boolean | string;
  readonly sort_order: number | string | null;
};

function isActive(value: boolean | string): boolean {
  return value === true || value === 'true';
}

export async function listFreebies(
  supabase: DbClient,
  tenantId: string | null,
  customerId: string,
): Promise<FreebieRecord[]> {
  let query = supabase.from('freebies').select('*');
  query = tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId);
  const result = (await query) as QueryResult<FreebieRow[]>;
  if (result.error) {
    throw new AppError('FREEBIE_READ_FAILED', result.error.message, 500);
  }
  const summary = await referralSummary(supabase, customerId);
  const claims = (await supabase.from('freebie_claims').select('freebie_id').eq('customer_id', customerId)) as QueryResult<
    Array<{ freebie_id: string }>
  >;
  const claimed = new Set((claims.data ?? []).map((row) => row.freebie_id));
  return (result.data ?? [])
    .filter((row) => isActive(row.active))
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
    .map((row) => {
      const required = Number(row.required_referrals);
      return {
        id: row.id,
        title: row.title,
        description: row.description ?? '',
        kind: row.kind === 'link' ? 'link' : 'text',
        content: row.content,
        required,
        unlocked: summary.qualified >= required,
        claimed: claimed.has(row.id),
      };
    });
}

/**
 * Shows unlocked content. A second claim returns the same content and writes nothing new.
 */
export async function claimFreebie(
  supabase: DbClient,
  input: { readonly tenantId: string | null; readonly customerId: string; readonly freebieId: string },
): Promise<{ readonly status: 'missing' | 'locked' | 'ready'; readonly freebie: FreebieRecord | null }> {
  const items = await listFreebies(supabase, input.tenantId, input.customerId);
  const freebie = items.find((item) => item.id === input.freebieId) ?? null;
  if (!freebie) {
    return { status: 'missing', freebie: null };
  }
  if (!freebie.unlocked) {
    return { status: 'locked', freebie };
  }
  if (freebie.claimed) {
    return { status: 'ready', freebie };
  }
  const inserted = await supabase.from('freebie_claims').insert({
    freebie_id: freebie.id,
    customer_id: input.customerId,
  });
  if (inserted.error && !/duplicate|unique/i.test(inserted.error.message)) {
    throw new AppError('FREEBIE_CLAIM_FAILED', inserted.error.message, 500);
  }
  return { status: 'ready', freebie };
}
