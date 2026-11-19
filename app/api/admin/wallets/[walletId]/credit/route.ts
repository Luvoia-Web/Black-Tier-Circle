/**
 * @file app/api/admin/wallets/[walletId]/credit/route.ts
 *
 * POST, owner only. Manual credit to a reseller wallet.
 *
 * @module Api
 */

import { z } from 'zod';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { ManualAdjustSchema } from '@/lib/validations/wallet';
import { manualCredit } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly walletId: string };
};

const IdSchema = z.string().uuid();

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const rate = await consumeRateLimit({ key: `wallet:adjust:${session.user.id}`, limit: 30, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many wallet adjustments. Please wait a minute.');
    }
    const walletId = IdSchema.parse(context.params.walletId);
    const parsed = ManualAdjustSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const wallet = await manualCredit(db, walletId, parsed.amountUsdtStr, session.user.id, parsed.note);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: wallet.tenantId,
      action: 'wallet.credit',
      target_type: 'wallet',
      target_id: walletId,
      reason: parsed.note,
      after_val: { amountMinor: parsed.amountUsdtStr.toString() },
    });
    return jsonSuccess(wallet);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
