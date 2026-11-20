/**
 * @file app/api/platform/people/route.ts
 *
 * Buyers and resellers listing, plus buyer block/unblock and wallet credit/debit.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { sanitizeInput } from '@/lib/sanitize';
import {
  adjustCustomerCredit,
  blockCustomer,
  getBotConnection,
  getCustomerById,
  setCustomerBlocked,
} from '@/modules/bots';
import { readPeople } from '@/modules/platform/people';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

const WalletAdjustBody = z.object({
  action: z.enum(['credit', 'debit']),
  customerId: z.string().uuid(),
  amountUsdt: z.string().trim().min(1).max(24),
  reason: z.string().trim().min(2).max(240),
});

const BlockBody = z.object({
  action: z.enum(['block', 'unblock']).optional(),
  customerId: z.string().uuid(),
  blocked: z.boolean().optional(),
  reason: z.string().trim().max(300).optional(),
});

const PeoplePostSchema = z.union([WalletAdjustBody, BlockBody]);

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to people', 403);
  }
  const db = asDbClient(session.admin);
  if (role === 'owner') {
    return { db, role, tenantId: null as string | null, botId: null as string | null, userId: session.user.id };
  }
  const tenant = await getTenantByUserId(db, session.user.id);
  const connection = await getBotConnection(db, tenant.id);
  return { db, role, tenantId: tenant.id, botId: connection?.id ?? null, userId: session.user.id };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const url = new URL(request.url);
    const payload = await readPeople(current.db, {
      role: current.role,
      tenantId: current.tenantId,
      botId: current.botId,
      kind: url.searchParams.get('type') ?? 'buyer',
      q: url.searchParams.get('q') ?? '',
      state: url.searchParams.get('state') ?? 'all',
      page: Number(url.searchParams.get('page') ?? '1'),
      pageSize: Number(url.searchParams.get('pageSize') ?? '24'),
    });
    return jsonSuccess({ ...payload, role: current.role });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const rate = await consumeRateLimit({ key: `people:mutate:${current.userId}`, limit: 30, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many requests. Please wait a minute.');
    }
    const raw = await readJsonBody(request);
    const parsed = PeoplePostSchema.parse(raw);

    const customer = await getCustomerById(current.db, parsed.customerId);
    if (current.role === 'reseller' && (!current.botId || customer.botId !== current.botId)) {
      throw new AuthError('FORBIDDEN', 'That buyer is not in your store', 403);
    }

    if ('amountUsdt' in parsed) {
      let amountMinor = 0n;
      try {
        amountMinor = usdtToMinor(parsed.amountUsdt);
      } catch {
        throw new ValidationError('INVALID_AMOUNT', 'Enter a valid USDT amount (for example 5.00).');
      }
      if (amountMinor <= 0n || amountMinor > 100_000_000_000n) {
        throw new ValidationError('INVALID_AMOUNT', 'Amount must be greater than zero and within bounds.');
      }
      const delta = parsed.action === 'debit' ? -amountMinor : amountMinor;
      const reason = sanitizeInput(parsed.reason) || (parsed.action === 'credit' ? 'Manual credit' : 'Manual debit');
      const newBalance = await adjustCustomerCredit(current.db, customer.id, delta);
      await current.db.from('audit_log').insert({
        actor_id: current.userId,
        tenant_id: current.tenantId,
        action: parsed.action === 'credit' ? 'customer.credit' : 'customer.debit',
        target_type: 'customer',
        target_id: customer.id,
        reason,
        after_val: { amountMinor: amountMinor.toString(), balanceMinor: newBalance.toString() },
      });
      return jsonSuccess({
        customerId: customer.id,
        balance: formatUsdt(newBalance),
        balanceMinor: newBalance.toString(),
      });
    }

    const blocked = parsed.action ? parsed.action === 'block' : parsed.blocked === true;
    const reason = sanitizeInput(parsed.reason ?? '').slice(0, 200);
    const result = blocked
      ? await blockCustomer(current.db, customer.id, reason || 'Blocked from Customers')
      : await setCustomerBlocked(current.db, customer.id, false);
    await current.db.from('audit_log').insert({
      actor_id: current.userId,
      tenant_id: current.tenantId,
      action: blocked ? 'customer.block' : 'customer.unblock',
      target_type: 'customer',
      target_id: customer.id,
      reason: reason || (blocked ? 'Blocked buyer' : 'Unblocked buyer'),
    });
    return jsonSuccess({ blocked, storedReason: result.storedReason });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
