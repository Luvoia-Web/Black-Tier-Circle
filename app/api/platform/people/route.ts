/**
 * @file app/api/platform/people/route.ts
 *
 * Buyers and resellers, plus block and unblock.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, NotFoundError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { blockCustomer, getBotConnection, getCustomerById, setCustomerBlocked } from '@/modules/bots';
import { readPeople } from '@/modules/platform/people';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

async function scope(): Promise<{ db: ReturnType<typeof asDbClient>; role: 'owner' | 'reseller'; tenantId: string | null; botId: string | null; userId: string }> {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to people', 403);
  }
  const db = asDbClient(session.admin);
  if (role === 'owner') {
    return { db, role, tenantId: null, botId: null, userId: session.user.id };
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
      page: Number(url.searchParams.get('page') ?? '1'),
      pageSize: Number(url.searchParams.get('pageSize') ?? '24'),
    });
    return jsonSuccess(payload);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const body = (await readJsonBody(request)) as { customerId?: unknown; blocked?: unknown; reason?: unknown };
    const customerId = typeof body.customerId === 'string' ? body.customerId : '';
    const blocked = body.blocked === true;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
    if (!customerId) {
      throw new ValidationError('CUSTOMER_REQUIRED', 'Choose a buyer before blocking.');
    }
    const customer = await getCustomerById(current.db, customerId);
    if (current.role === 'reseller' && customer.botId !== current.botId) {
      throw new AuthError('FORBIDDEN', 'That buyer is not in your store', 403);
    }
    if (blocked) {
      const result = await blockCustomer(current.db, customerId, reason || 'Blocked from People');
      return jsonSuccess({ blocked: true, storedReason: result.storedReason });
    }
    const result = await setCustomerBlocked(current.db, customerId, false);
    return jsonSuccess({ blocked: false, storedReason: result.storedReason });
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      return handleRouteError(error);
    }
    return handleRouteError(error);
  }
}
