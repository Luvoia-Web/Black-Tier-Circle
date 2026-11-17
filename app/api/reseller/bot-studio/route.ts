/**
 * Reseller Bot Studio. The tenant always comes from the session.
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { buyerCategoryNames } from '@/modules/catalog/buyer-category';
import { listResellerListings } from '@/modules/pricing';
import { assertResellerFieldsAllowed } from '@/modules/platform/policy';
import { readStudio, writeStudio } from '@/modules/store-config/access';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = asDbClient(session.admin);
    const studio = await readStudio(db, 'reseller', session.tenant.id);
    const listings = await listResellerListings(db, session.tenant.id);
    const buyerCategories = buyerCategoryNames(
      listings.filter((listing) => listing.product.status === 'published').map((listing) => listing.product),
    );
    return jsonSuccess({ ...studio, buyerCategories });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    await assertRateLimit(`bot-studio:${session.user.id}`, 30);
    const db = asDbClient(session.admin);
    await assertResellerFieldsAllowed(db, ['botCopy']);
    const saved = await writeStudio(
      db,
      'reseller',
      session.tenant.id,
      await readJsonBody(request),
      session.user.id,
    );
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
