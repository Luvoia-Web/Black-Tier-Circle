/**
 * @file app/api/admin/wallets/[walletId]/debit/route.ts
 *
 * POST, owner only. Manual debit from a reseller wallet.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { ManualAdjustSchema } from '@/lib/validations/wallet';
import { manualDebit } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly walletId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = ManualAdjustSchema.parse(await readJsonBody(request));
    const wallet = await manualDebit(
      asDbClient(session.admin),
      context.params.walletId,
      parsed.amountUsdtStr,
      session.user.id,
      parsed.note,
    );
    return jsonSuccess(wallet);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
