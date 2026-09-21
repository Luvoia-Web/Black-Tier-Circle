/**
 * @file app/api/reseller/customers/route.ts
 *
 * GET buyer records for the reseller's bot. Mapped from customers + order spend.
 *
 * Phase 9 auth audit: getUser() via requireReseller.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import { getBotConnection, listCustomers } from '@/modules/bots';
import { listOrders } from '@/modules/orders';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const params = new URL(request.url).searchParams;
    const search = (params.get('q') ?? '').trim().toLowerCase();
    const onlyBalance = params.get('withBalance') === '1';
    const db = asDbClient(session.admin);
    const connection = await getBotConnection(db, session.tenant.id);
    const customers = connection ? await listCustomers(db, connection.id) : [];
    const orders = await listOrders(db, { tenantId: session.tenant.id, limit: 500 });
    const rows = customers.map((customer) => {
      const theirs = orders.filter((order) => order.customerId === customer.id);
      const spent = theirs
        .filter((order) => order.paymentStatus === 'verified' || order.fulfillmentStatus === 'ready')
        .reduce((sum, order) => sum + order.quotedRetailPriceMinor, 0n);
      return {
        id: customer.id,
        buyer: customer.username
          ? `@${customer.username}`
          : (customer.firstName ?? customer.telegramUserId),
        username: customer.username,
        chatId: customer.telegramChatId,
        telegramUserId: customer.telegramUserId,
        balanceMinor: customer.creditBalanceMinor.toString(),
        balance: formatUsdt(customer.creditBalanceMinor),
        spentMinor: spent.toString(),
        spent: formatUsdt(spent),
        status: customer.isBlocked ? 'frozen' : 'active',
      };
    });
    const filtered = rows.filter((row) => {
      if (onlyBalance && BigInt(row.balanceMinor) <= 0n) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        row.buyer.toLowerCase().includes(search) ||
        row.chatId.includes(search) ||
        row.telegramUserId.includes(search) ||
        (row.username ?? '').toLowerCase().includes(search)
      );
    });
    const totalCredit = rows.reduce((sum, row) => sum + BigInt(row.balanceMinor), 0n);
    return jsonSuccess({
      stats: {
        totalCredit: formatUsdt(totalCredit),
        withBalance: rows.filter((row) => BigInt(row.balanceMinor) > 0n).length,
        frozen: rows.filter((row) => row.status === 'frozen').length,
      },
      rows: filtered,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
