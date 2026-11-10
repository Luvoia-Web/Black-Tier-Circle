/**
 * Reseller bulk tiers for one of their listings.
 * The tenant always comes from the session. A tenant id in the body is ignored.
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { usdtToMinor } from '@/lib/money';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { BulkTiersBodySchema } from '@/lib/validations/bulk-tiers';
import { getOwnedListing } from '@/modules/pricing';
import { replaceBulkTiers, tierContext } from '@/modules/pricing/tier-store';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly listingId: string };
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
    const session = await requireReseller();
    const db = asDbClient(session.admin);
    const listing = await getOwnedListing(db, context.params.listingId, session.tenant.id);
    return jsonSuccess(present(await tierContext(db, listing.productId, session.tenant.id)));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    assertRateLimit(`bulk-tiers:${session.user.id}`, 30);
    const parsed = BulkTiersBodySchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const listing = await getOwnedListing(db, context.params.listingId, session.tenant.id);
    await replaceBulkTiers(
      db,
      listing.productId,
      session.tenant.id,
      parsed.tiers.map((tier) => ({ minQty: tier.minQty, unitPriceMinor: usdtToMinor(tier.unitPrice) })),
    );
    const { error } = await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: session.tenant.id,
      action: 'bulk_tiers.save',
      target_type: 'product',
      target_id: listing.productId,
      after_val: { tiers: parsed.tiers, listingId: listing.id },
      reason: 'reseller bulk tier save',
    });
    if (error) {
      throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
    }
    return jsonSuccess(present(await tierContext(db, listing.productId, session.tenant.id)));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
