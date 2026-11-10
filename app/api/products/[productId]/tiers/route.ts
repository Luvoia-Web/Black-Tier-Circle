/**
 * Owner bulk tiers for one product. Tenant is always the owner store.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { usdtToMinor } from '@/lib/money';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { BulkTiersBodySchema } from '@/lib/validations/bulk-tiers';
import { replaceBulkTiers, tierContext } from '@/modules/pricing/tier-store';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly productId: string };
};

function present(context: Awaited<ReturnType<typeof tierContext>>) {
  return {
    tiers: context.tiers.map((tier) => ({
      id: tier.id,
      minQty: tier.minQty,
      unitPriceMinor: tier.unitPriceMinor.toString(),
    })),
    floorMinor: context.floor.minor === null ? null : context.floor.minor.toString(),
    floorKnown: context.floor.known,
    baseUnitMinor: context.baseUnit.toString(),
    note: context.note,
  };
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const db = asDbClient(session.admin);
    return jsonSuccess(present(await tierContext(db, context.params.productId, null)));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    assertRateLimit(`bulk-tiers:${session.user.id}`, 30);
    const parsed = BulkTiersBodySchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const productId = context.params.productId;
    await replaceBulkTiers(
      db,
      productId,
      null,
      parsed.tiers.map((tier) => ({ minQty: tier.minQty, unitPriceMinor: usdtToMinor(tier.unitPrice) })),
    );
    const { error } = await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: null,
      action: 'bulk_tiers.save',
      target_type: 'product',
      target_id: productId,
      after_val: { tiers: parsed.tiers },
      reason: 'owner bulk tier save',
    });
    if (error) {
      throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
    }
    return jsonSuccess(present(await tierContext(db, productId, null)));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
