/**
 * @file app/api/reseller/customers/[customerId]/route.ts
 *
 * GET history / PATCH add, deduct, freeze mapped buyer credit.
 *
 * Phase 9 auth audit: getUser() via requireReseller, tenant-scoped customer.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { sanitizeInput } from '@/lib/sanitize';
import { CustomerAdjustSchema } from '@/lib/validations/tenant-settings';
import {
  adjustCustomerCredit,
  getBotConnection,
  getCustomerById,
  listCustomers,
  setCustomerBlocked,
} from '@/modules/bots';
import { listOrders } from '@/modules/orders';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly customerId: string };
};

async function assertOwnedCustomer(
  session: Awaited<ReturnType<typeof requireReseller>>,
  customerId: string,
) {
  const db = asDbClient(session.admin);
  const connection = await getBotConnection(db, session.tenant.id);
  if (!connection) {
    throw new AuthError('FORBIDDEN', 'No bot connected', 403);
  }
  const customers = await listCustomers(db, connection.id);
  if (!customers.some((item) => item.id === customerId)) {
    throw new AuthError('FORBIDDEN', 'Customer is not in your store', 403);
  }
  return db;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = await assertOwnedCustomer(session, context.params.customerId);
    const customer = await getCustomerById(db, context.params.customerId);
    const orders = await listOrders(db, {
      tenantId: session.tenant.id,
      customerId: customer.id,
      limit: 100,
    });
    return jsonSuccess({
      customer: {
        id: customer.id,
        buyer: customer.username ? `@${customer.username}` : customer.firstName,
        balance: formatUsdt(customer.creditBalanceMinor),
        status: customer.isBlocked ? 'frozen' : 'active',
      },
      history: orders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt.toISOString(),
        amount: formatUsdt(order.quotedRetailPriceMinor),
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
      })),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = await assertOwnedCustomer(session, context.params.customerId);
    const parsed = CustomerAdjustSchema.parse(await readJsonBody(request));
    if (parsed.action === 'freeze') {
      await setCustomerBlocked(db, context.params.customerId, true);
    } else if (parsed.action === 'unfreeze') {
      await setCustomerBlocked(db, context.params.customerId, false);
    } else {
      const amount = usdtToMinor(parsed.amountUsdt ?? '0');
      const delta = parsed.action === 'deduct' ? -amount : amount;
      await adjustCustomerCredit(db, context.params.customerId, delta);
    }
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: session.tenant.id,
      action: `customer.${parsed.action}`,
      target_type: 'customer',
      target_id: context.params.customerId,
      reason: parsed.note ? sanitizeInput(parsed.note) : parsed.action,
    });
    const customer = await getCustomerById(db, context.params.customerId);
    return jsonSuccess({
      id: customer.id,
      balance: formatUsdt(customer.creditBalanceMinor),
      status: customer.isBlocked ? 'frozen' : 'active',
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
